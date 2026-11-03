import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyResendWebhookSignature } from "@/lib/inbound/verify-svix";
import { storeInboundMessage } from "@/lib/inbound/store-message";
import { extractEmail } from "@/lib/reply";

export const runtime = "nodejs";
// Downloading attachments from Resend and saving them can take a while.
export const maxDuration = 60;

// Files bigger than this are listed on the message but not saved.
const MAX_INBOUND_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/**
 * POST /api/inbound/resend/:domainId
 *
 * One webhook URL per domain — each domain admin who chooses Resend as
 * their provider configures THIS exact URL (with their own domain's id)
 * in their own Resend account's Webhooks page, and pastes the signing
 * secret Resend generates back into Vertex Mail (Admin -> Domains ->
 * Email provider). That per-domain secret is what authenticates this
 * request — there's no single shared secret like the Cloudflare path's
 * INBOUND_WEBHOOK_SECRET, because different domains here can genuinely
 * be different people's independent Resend accounts.
 *
 * Flow:
 *   1. Look up this domain's resend_webhook_secret + api_key (admin
 *      client — domain_email_settings RLS is admin-only, and there's no
 *      signed-in user on an inbound webhook).
 *   2. Verify the Svix signature against THAT domain's secret.
 *   3. Confirm the event is email.received, extract the email id.
 *   4. Fetch the full email from Resend's Retrieve Received Email API
 *      (docs.resend.com/api-reference/emails/retrieve-received-email) —
 *      the webhook payload itself only carries the id, not the body.
 *   5. Normalize + store via the same storeInboundMessage() the
 *      Cloudflare path uses.
 *
 * NOTE ON STABILITY: Resend's own docs mark receiving as private
 * beta/alpha as of this writing — "APIs might change before GA." This
 * route may need updating if Resend changes the webhook payload shape
 * or the retrieve-email response shape before general availability.
 *
 * ATTACHMENTS: the retrieve-email response only carries attachment metadata,
 * so after fetching the email we call Resend's "list received email
 * attachments" endpoint, which returns a short-lived signed download_url per
 * file. We download each file here (server-to-server, so Vercel's request-body
 * limit doesn't apply) and hand the bytes to storeInboundMessage(), which saves
 * them to Supabase Storage.
 */
export async function POST(req: NextRequest, { params }: { params: { domainId: string } }) {
  const db = createAdminClient();

  const { data: settings } = await db
    .from("domain_email_settings")
    .select("provider, api_key, resend_webhook_secret")
    .eq("domain_id", params.domainId)
    .maybeSingle();

  if (!settings || settings.provider !== "resend" || !settings.api_key || !settings.resend_webhook_secret) {
    // Not configured for Resend receiving — don't leak WHICH piece is
    // missing to an unauthenticated caller.
    return NextResponse.json({ error: "not_configured" }, { status: 404 });
  }

  const rawBody = await req.text();
  const valid = verifyResendWebhookSignature(
    settings.resend_webhook_secret.trim(),
    req.headers.get("svix-id"),
    req.headers.get("svix-timestamp"),
    req.headers.get("svix-signature"),
    rawBody
  );

  if (!valid) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event?.type !== "email.received") {
    // Resend may send other event types to the same endpoint later —
    // acknowledge, don't error, so Resend doesn't retry pointlessly.
    return NextResponse.json({ status: "ignored", type: event?.type ?? null });
  }

  const emailId: string | undefined = event?.data?.email_id ?? event?.data?.id;
  if (!emailId) {
    return NextResponse.json({ error: "missing_email_id" }, { status: 400 });
  }

  const emailRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${settings.api_key}` },
  });

  if (!emailRes.ok) {
    // Acknowledge with 200 anyway would cause silent data loss; surface
    // the failure so Resend's webhook retry logic gets a chance to
    // succeed once whatever's wrong (e.g. a rotated key) is fixed.
    return NextResponse.json({ error: "resend_fetch_failed", status: emailRes.status }, { status: 502 });
  }

  const email = await emailRes.json();

  // Resend may return "Display Name <addr@domain>" — store just the address.
  const rawFrom: string = email.from ?? "";
  const fromAddress = rawFrom.match(/<([^>]+)>/)?.[1] ?? rawFrom;

  // A Resend ACCOUNT can hold several domains, and every webhook in the account
  // receives every inbound email. So only act on mail addressed to THIS
  // webhook's own domain; another domain's webhook stores its own. Without
  // this, one email would be stored once per webhook.
  const { data: thisDomain } = await db.from("domains").select("domain_name").eq("id", params.domainId).maybeSingle();
  const recipients: string[] = (Array.isArray(email.to) ? email.to : [email.to]).filter(Boolean).map(extractEmail);
  const recipient = recipients.find((a) => a.toLowerCase().endsWith(`@${thisDomain?.domain_name}`));
  if (!thisDomain || !recipient) {
    return NextResponse.json({ status: "ignored_other_domain" });
  }

  const attachments = await fetchReceivedAttachments(emailId, settings.api_key, email.attachments);

  const result = await storeInboundMessage(db, {
    to: recipient,
    from: fromAddress,
    subject: email.subject ?? "(no subject)",
    text: email.text,
    html: email.html,
    messageIdHeader: email.message_id,
    inReplyTo: readHeader(email.headers, "in-reply-to"),
    attachments,
  });

  return NextResponse.json(result.body, { status: result.status });
}

/**
 * Best-effort read of a header from Resend's retrieved email. The shape of
 * `headers` isn't guaranteed while receiving is in beta (object or list of
 * {name,value}), so handle both and return null when absent — threading then
 * falls back to matching on subject + participant.
 */
function readHeader(headers: unknown, name: string): string | null {
  if (!headers) return null;
  if (Array.isArray(headers)) {
    const hit = headers.find((h) => typeof h?.name === "string" && h.name.toLowerCase() === name);
    return typeof hit?.value === "string" ? hit.value : null;
  }
  if (typeof headers === "object") {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (k.toLowerCase() === name && typeof v === "string") return v;
    }
  }
  return null;
}

/**
 * Pulls every attachment of a received email from Resend. Never throws: a
 * problem with one file must not lose the whole email, so failures are logged
 * and that file is skipped (or kept as metadata only when it's too big).
 */
async function fetchReceivedAttachments(
  emailId: string,
  apiKey: string,
  fromEmailObject: unknown
): Promise<{ fileName: string; contentType: string; sizeBytes: number; contentBase64: string }[]> {
  const out: { fileName: string; contentType: string; sizeBytes: number; contentBase64: string }[] = [];
  try {
    const headers = { Authorization: `Bearer ${apiKey}` };
    const listRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, { headers });

    let items: any[] = [];
    if (listRes.ok) {
      const json = await listRes.json();
      items = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    } else if (Array.isArray(fromEmailObject)) {
      // Fall back to the metadata embedded in the email itself.
      items = fromEmailObject as any[];
    }

    for (const item of items) {
      try {
        const fileName: string = item.filename ?? item.file_name ?? "attachment";
        const contentType: string = item.content_type ?? "application/octet-stream";

        // Skip images embedded inside the HTML body (logos, signatures) — they
        // aren't real attachments and would clutter the message.
        if (item.content_disposition === "inline" && contentType.startsWith("image/")) continue;

        const declaredSize = typeof item.size === "number" ? item.size : 0;
        if (declaredSize > MAX_INBOUND_ATTACHMENT_BYTES) {
          out.push({ fileName, contentType, sizeBytes: declaredSize, contentBase64: "" });
          continue;
        }

        // The list response normally includes download_url; if not, ask for the single attachment.
        let url: string | undefined = item.download_url;
        if (!url && item.id) {
          const one = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments/${item.id}`, { headers });
          if (one.ok) url = (await one.json())?.download_url;
        }
        if (!url) {
          out.push({ fileName, contentType, sizeBytes: declaredSize, contentBase64: "" });
          continue;
        }

        const fileRes = await fetch(url);
        if (!fileRes.ok) {
          console.error("[inbound] attachment download failed", fileName, fileRes.status);
          out.push({ fileName, contentType, sizeBytes: declaredSize, contentBase64: "" });
          continue;
        }
        const bytes = Buffer.from(await fileRes.arrayBuffer());
        if (bytes.length > MAX_INBOUND_ATTACHMENT_BYTES) {
          out.push({ fileName, contentType, sizeBytes: bytes.length, contentBase64: "" });
          continue;
        }
        out.push({ fileName, contentType, sizeBytes: bytes.length, contentBase64: bytes.toString("base64") });
      } catch (e) {
        console.error("[inbound] attachment error", e);
      }
    }
  } catch (e) {
    console.error("[inbound] listing attachments failed", e);
  }
  return out;
}
