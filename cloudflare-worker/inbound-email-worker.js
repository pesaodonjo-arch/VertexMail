/**
 * Vertex Mail — inbound email Worker
 *
 * Bound to Cloudflare Email Routing for every verified Vertex Mail
 * domain via a single catch-all route pattern (*@{domain}) added
 * automatically when a domain is verified (see the Admin → Domains
 * "verify" flow, POST /api/admin/domains/[id]/verify). No per-domain
 * code lives here — the same Worker script serves darasa.site,
 * fluencyai.app, clockeadinnovations.co.ke, and any domain added later.
 *
 * Deploy: wrangler deploy (see wrangler.toml). Set INBOUND_WEBHOOK_SECRET
 * and VERTEX_INBOUND_URL as Worker secrets/vars, matching the app's
 * INBOUND_WEBHOOK_SECRET and its /api/inbound URL.
 */

import PostalMime from "postal-mime"; // add via `npm i postal-mime` in this worker's package.json

export default {
  async email(message, env, ctx) {
    try {
      const rawBytes = await streamToArrayBuffer(message.raw, message.rawSize);
      const parsed = await PostalMime.parse(rawBytes);

      const attachments = [];
      for (const att of parsed.attachments ?? []) {
        // Cap attachment relay size; large attachments should instead be
        // uploaded directly to storage by a follow-up job. Kept simple here.
        if (att.content && att.content.byteLength < 8 * 1024 * 1024) {
          attachments.push({
            fileName: att.filename ?? "attachment",
            contentType: att.mimeType ?? "application/octet-stream",
            sizeBytes: att.content.byteLength,
            contentBase64: arrayBufferToBase64(att.content),
          });
        }
      }

      const payload = JSON.stringify({
        to: message.to,
        from: message.from,
        subject: parsed.subject ?? "(no subject)",
        text: parsed.text ?? "",
        html: parsed.html ?? "",
        messageIdHeader: parsed.messageId ?? undefined,
        inReplyTo: parsed.inReplyTo ?? undefined,
        attachments,
      });

      const signature = await hmacSha256Hex(env.INBOUND_WEBHOOK_SECRET, payload);

      const res = await fetch(env.VERTEX_INBOUND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Vertex-Signature": signature,
        },
        body: payload,
      });

      if (!res.ok) {
        // Unknown/suspended mailbox, unverified domain, etc. — bounce
        // rather than silently dropping.
        if (res.status === 404) {
          message.setReject("Unknown or inactive mailbox");
          return;
        }
        throw new Error(`inbound webhook returned ${res.status}`);
      }
    } catch (err) {
      console.error("vertex-mail inbound worker error", err);
      message.setReject("Temporary failure processing message");
    }
  },
};

async function streamToArrayBuffer(stream, size) {
  const reader = stream.getReader();
  const buffer = new Uint8Array(size);
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer.set(value, offset);
    offset += value.length;
  }
  return buffer.buffer;
}

function arrayBufferToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
