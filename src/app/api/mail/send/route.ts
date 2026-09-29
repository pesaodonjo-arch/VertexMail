import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailProvider } from "@/lib/email-provider";
import { resolveDomainProvider } from "@/lib/email-provider/resolve-for-domain";

interface ComposeBody {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyToThreadId?: string; // reply within an existing thread
  saveAsDraft?: boolean;
}

// The web/mobile compose UI hits this, not /api/v1/send. It uses the
// caller's own session, so "from" is always the signed-in mailbox —
// there's no from field in the body at all, which removes any need to
// re-validate a claimed sender address for UI-originated mail.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: mailbox } = await supabase
    .from("mailboxes")
    .select("id, local_part, display_name, status, domain_id, domains(domain_name)")
    .eq("auth_user_id", user.id)
    .single();

  if (!mailbox || mailbox.status !== "active") {
    return NextResponse.json({ error: "mailbox_inactive" }, { status: 403 });
  }

  const body: ComposeBody = await req.json();
  const fromAddress = `${mailbox.local_part}@${(mailbox as any).domains.domain_name}`;

  let threadId: string | null = null;
  let inReplyTo: string | undefined;
  let references: string | undefined;

  if (body.inReplyToThreadId) {
    // Load the thread with the caller's own session: RLS returns nothing if it
    // isn't theirs, so a reply can't be attached to someone else's conversation.
    const { data: thread } = await supabase
      .from("threads")
      .select("id")
      .eq("id", body.inReplyToThreadId)
      .maybeSingle();
    if (!thread) return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
    threadId = thread.id;

    // Standard threading headers: In-Reply-To = the message being answered,
    // References = the chain so far. This is what lets Gmail/Outlook show my
    // reply inside the same conversation on the recipient's side.
    const { data: chain } = await supabase
      .from("messages")
      .select("message_id_header")
      .eq("thread_id", thread.id)
      .not("message_id_header", "is", null)
      .order("created_at", { ascending: true });
    const ids = (chain ?? []).map((m) => m.message_id_header as string).filter(Boolean);
    if (ids.length > 0) {
      inReplyTo = ids[ids.length - 1];
      references = ids.slice(-10).join(" ");
    }
  }

  if (!threadId) {
    const { data: thread } = await supabase
      .from("threads")
      .insert({ mailbox_id: mailbox.id, subject: body.subject, folder: body.saveAsDraft ? "drafts" : "sent", is_read: true })
      .select("id")
      .single();
    threadId = thread!.id;
  }

  if (body.saveAsDraft) {
    const { data: draft, error } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        mailbox_id: mailbox.id,
        direction: "outbound",
        from_address: fromAddress,
        to_addresses: body.to ?? [],
        cc_addresses: body.cc ?? [],
        bcc_addresses: body.bcc ?? [],
        subject: body.subject,
        body_text: body.text,
        body_html: body.html,
        is_draft: true,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ status: "draft_saved", message_id: draft?.id });
  }

  try {
    // Admin client only for the domain_email_settings lookup (its RLS is
    // admin-only, and this sender is a mailbox owner, not necessarily a
    // domain admin) — nothing else in this route uses elevated access.
    const override = await resolveDomainProvider(createAdminClient(), mailbox.domain_id);
    const provider = getEmailProvider(override);
    const result = await provider.send({
      from: fromAddress,
      fromName: mailbox.display_name ?? undefined,
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      text: body.text,
      html: body.html,
      inReplyTo,
      headers: references ? { References: references } : undefined,
    });

    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        mailbox_id: mailbox.id,
        direction: "outbound",
        from_address: fromAddress,
        to_addresses: body.to,
        cc_addresses: body.cc ?? [],
        bcc_addresses: body.bcc ?? [],
        subject: body.subject,
        body_text: body.text,
        body_html: body.html,
        in_reply_to: inReplyTo ?? null,
        provider_message_id: result.providerMessageId,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ status: "sent", message_id: message?.id });
  } catch (err) {
    return NextResponse.json({ error: "provider_error", message: (err as Error).message }, { status: 502 });
  }
}
