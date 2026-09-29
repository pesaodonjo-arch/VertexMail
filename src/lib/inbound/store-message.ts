import type { SupabaseClient } from "@supabase/supabase-js";
import { extractEmail, hasReplyPrefix, normalizeSubject } from "@/lib/reply";

export interface NormalizedInboundEmail {
  to: string; // full recipient address, e.g. admin1@darasa.site
  from: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  messageIdHeader?: string | null;
  inReplyTo?: string | null;
  attachments?: { fileName: string; contentType: string; sizeBytes: number; contentBase64: string }[];
}

export interface StoreResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Resolves a normalized inbound email to a mailbox and persists it
 * (thread + message + attachments), regardless of which provider it
 * came from. Both src/app/api/inbound/route.ts (Cloudflare Worker) and
 * src/app/api/inbound/resend/[domainId]/route.ts (Resend) normalize
 * their provider-specific payload into NormalizedInboundEmail first,
 * then call this — so domain/mailbox lookup, threading, and storage
 * only exist in one place.
 */
export async function storeInboundMessage(
  db: SupabaseClient,
  payload: NormalizedInboundEmail
): Promise<StoreResult> {
  const [localPart, domainName] = payload.to.toLowerCase().split("@");
  if (!localPart || !domainName) {
    return { status: 400, body: { error: "invalid_recipient" } };
  }

  const { data: domain } = await db
    .from("domains")
    .select("id, status")
    .eq("domain_name", domainName)
    .maybeSingle();

  if (!domain || domain.status !== "verified") {
    return { status: 404, body: { error: "unknown_domain" } };
  }

  const { data: mailbox } = await db
    .from("mailboxes")
    .select("id, status")
    .eq("domain_id", domain.id)
    .eq("local_part", localPart)
    .maybeSingle();

  if (!mailbox || mailbox.status !== "active") {
    // Address doesn't exist or is suspended — bounce, don't silently store.
    return { status: 404, body: { error: "unknown_or_inactive_mailbox" } };
  }

  // Idempotency: providers retry webhooks (and can replay them), so the same
  // email can arrive more than once. Its Message-ID is unique — if we already
  // stored it for this mailbox, acknowledge without storing a second copy.
  if (payload.messageIdHeader) {
    const { data: already } = await db
      .from("messages")
      .select("id")
      .eq("mailbox_id", mailbox.id)
      .eq("message_id_header", payload.messageIdHeader)
      .maybeSingle();
    if (already) return { status: 200, body: { status: "duplicate", message_id: already.id } };
  }

  // Thread by In-Reply-To when we recognize it, else start a new thread.
  let threadId: string | null = null;
  if (payload.inReplyTo) {
    const { data: existing } = await db
      .from("messages")
      .select("thread_id")
      .eq("mailbox_id", mailbox.id)
      .eq("message_id_header", payload.inReplyTo)
      .maybeSingle();
    threadId = existing?.thread_id ?? null;
  }

  // Fallback: providers often assign their own Message-ID to what we send, so
  // a reply's In-Reply-To won't match anything we stored. Do what mail clients
  // do instead — a "Re: X" from someone who's already part of a conversation
  // called "X" in this mailbox belongs to that conversation.
  if (!threadId && hasReplyPrefix(payload.subject)) {
    threadId = await findThreadBySubjectAndParticipant(db, mailbox.id, payload.subject, payload.from);
  }

  if (!threadId) {
    const { data: thread } = await db
      .from("threads")
      .insert({ mailbox_id: mailbox.id, subject: payload.subject || "(no subject)", folder: "inbox", is_read: false })
      .select("id")
      .single();
    threadId = thread!.id;
  } else {
    // A conversation the person marked as spam stays there when the sender writes again.
    const { data: existingThread } = await db.from("threads").select("folder").eq("id", threadId).maybeSingle();
    if (existingThread?.folder !== "spam") {
      await db.from("threads").update({ folder: "inbox", is_read: false }).eq("id", threadId);
    }
  }

  const { data: message } = await db
    .from("messages")
    .insert({
      thread_id: threadId,
      mailbox_id: mailbox.id,
      direction: "inbound",
      from_address: payload.from,
      to_addresses: [payload.to],
      subject: payload.subject || "(no subject)",
      body_text: payload.text ?? null,
      body_html: payload.html ?? null,
      in_reply_to: payload.inReplyTo ?? null,
      message_id_header: payload.messageIdHeader ?? null,
    })
    .select("id")
    .single();

  for (const att of payload.attachments ?? []) {
    // In production: upload att.contentBase64 to Supabase Storage under
    // `mailbox/{mailbox.id}/{message.id}/{fileName}` and store the path.
    const storagePath = `mailbox/${mailbox.id}/${message!.id}/${att.fileName}`;
    await db.from("attachments").insert({
      message_id: message!.id,
      mailbox_id: mailbox.id,
      file_name: att.fileName,
      content_type: att.contentType,
      size_bytes: att.sizeBytes,
      storage_path: storagePath,
    });
  }

  // Fire a push notification (best-effort — never fail the webhook on this).
  try {
    await db.from("push_subscriptions").select("*").eq("mailbox_id", mailbox.id);
    // for (const sub of subs ?? []) await sendWebPush(sub, { title: payload.from, body: payload.subject });
  } catch {
    /* notification failures never bounce the mail */
  }

  return { status: 200, body: { status: "stored", message_id: message?.id } };
}


async function findThreadBySubjectAndParticipant(
  db: SupabaseClient,
  mailboxId: string,
  subject: string,
  from: string
): Promise<string | null> {
  const wanted = normalizeSubject(subject);
  const sender = extractEmail(from).toLowerCase();
  // The address goes into a PostgREST filter string, so only accept plain addresses.
  if (!wanted || !/^[^\s,(){}"'<>]+@[^\s,(){}"'<>]+$/.test(sender)) return null;

  const { data: candidates } = await db
    .from("threads")
    .select("id, subject")
    .eq("mailbox_id", mailboxId)
    .not("folder", "in", "(trash,drafts)")
    .order("last_message_at", { ascending: false })
    .limit(50);

  for (const c of candidates ?? []) {
    if (normalizeSubject(c.subject) !== wanted) continue;
    const { data: involved } = await db
      .from("messages")
      .select("id")
      .eq("thread_id", c.id)
      .or(`from_address.eq.${sender},to_addresses.cs.{${sender}}`)
      .limit(1);
    if (involved && involved.length > 0) return c.id;
  }
  return null;
}
