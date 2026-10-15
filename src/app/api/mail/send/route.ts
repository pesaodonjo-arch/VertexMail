import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailProvider } from "@/lib/email-provider";
import { formatFromName } from "@/lib/sender-name";
import { resolveDomainProvider } from "@/lib/email-provider/resolve-for-domain";
import { ATTACHMENT_BUCKET, MAX_ATTACHMENTS, MAX_TOTAL_BYTES, isBlockedFileName } from "@/lib/attachments";

// Reading attachments back from storage and handing them to the provider can
// take a while for big files.
export const maxDuration = 60;

interface ComposeBody {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyToThreadId?: string; // reply within an existing thread
  saveAsDraft?: boolean;
  // Files the browser already uploaded to storage (see ComposeForm): we only get references.
  attachments?: { fileName: string; contentType: string; sizeBytes: number; path: string }[];
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
  const attachmentRefs = body.attachments ?? [];
  if (attachmentRefs.length > MAX_ATTACHMENTS) {
    return NextResponse.json({ error: "too_many_attachments", message: `Up to ${MAX_ATTACHMENTS} attachments per message.` }, { status: 400 });
  }
  if (body.saveAsDraft && attachmentRefs.length > 0) {
    return NextResponse.json(
      { error: "draft_attachments_unsupported", message: "Drafts can't keep attachments yet." },
      { status: 400 }
    );
  }

  // Load each uploaded file from storage. A path must sit in THIS user's own
  // folder, otherwise someone could ask us to email another person's file.
  const loaded: { fileName: string; contentType: string; sizeBytes: number; path: string; contentBase64: string }[] = [];
  if (attachmentRefs.length > 0) {
    const admin = createAdminClient();
    let total = 0;
    for (const ref of attachmentRefs) {
      if (!ref?.path || !ref.path.startsWith(`${user.id}/`) || ref.path.includes("..") || !ref.fileName) {
        return NextResponse.json({ error: "invalid_attachment", message: "One of the attachments is invalid." }, { status: 400 });
      }
      if (isBlockedFileName(ref.fileName)) {
        return NextResponse.json({ error: "blocked_type", message: `${ref.fileName} can't be sent (blocked file type).` }, { status: 400 });
      }
      const { data: blob, error: dlErr } = await admin.storage.from(ATTACHMENT_BUCKET).download(ref.path);
      if (dlErr || !blob) {
        return NextResponse.json({ error: "attachment_missing", message: `Couldn't read ${ref.fileName}. Remove it and attach it again.` }, { status: 400 });
      }
      const bytes = Buffer.from(await blob.arrayBuffer());
      total += bytes.length;
      if (total > MAX_TOTAL_BYTES) {
        return NextResponse.json({ error: "attachments_too_large", message: "Attachments are too large." }, { status: 413 });
      }
      loaded.push({
        fileName: ref.fileName,
        contentType: ref.contentType || "application/octet-stream",
        sizeBytes: bytes.length,
        path: ref.path,
        contentBase64: bytes.toString("base64"),
      });
    }
  }

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
      fromName: formatFromName(mailbox.display_name),
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      text: body.text,
      html: body.html,
      inReplyTo,
      headers: references ? { References: references } : undefined,
      attachments: loaded.map((a) => ({
        fileName: a.fileName,
        contentType: a.contentType,
        contentBase64: a.contentBase64,
      })),
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

    // Keep a record of what was attached (pointing at the stored file) so the
    // sent message shows its files in the thread and they can be downloaded.
    if (message && loaded.length > 0) {
      await supabase.from("attachments").insert(
        loaded.map((a) => ({
          message_id: message.id,
          mailbox_id: mailbox.id,
          file_name: a.fileName,
          content_type: a.contentType,
          size_bytes: a.sizeBytes,
          storage_path: a.path,
        }))
      );
    }
    return NextResponse.json({ status: "sent", message_id: message?.id });
  } catch (err) {
    return NextResponse.json({ error: "provider_error", message: (err as Error).message }, { status: 502 });
  }
}
