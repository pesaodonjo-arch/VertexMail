import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies a Resend webhook's Svix signature.
 *
 * Resend webhooks are signed via Svix (https://docs.svix.com/receiving/verifying-payloads/how-manual).
 * Implemented manually here (no `svix` package dependency) since the
 * scheme is a straightforward HMAC-SHA256:
 *
 *   signed_content = `${svixId}.${svixTimestamp}.${rawBody}`
 *   signature      = base64(HMAC_SHA256(secretBytes, signed_content))
 *
 * `secret` is the per-webhook signing secret Resend shows once when you
 * create the webhook (format: "whsec_<base64>"); `svixSignatureHeader`
 * may contain multiple space-separated "v1,<base64sig>" candidates —
 * any match is accepted, matching Svix's own verification behavior
 * during secret rotation.
 *
 * Also rejects requests whose svix-timestamp is more than 5 minutes
 * old, as a basic replay-protection measure (Svix's own libraries do
 * the same by default).
 */
export function verifyResendWebhookSignature(
  secret: string,
  svixId: string | null,
  svixTimestamp: string | null,
  svixSignatureHeader: string | null,
  rawBody: string
): boolean {
  if (!svixId || !svixTimestamp || !svixSignatureHeader) return false;

  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (ageSeconds > 300) return false; // 5 minute tolerance

  const secretBytes = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  // Compare RAW bytes on both sides. The header carries base64 text, so
  // decode it and compare against the raw HMAC digest (32 bytes) — not
  // against the base64 string of the digest, which is a different length
  // and would never match.
  const expectedBuf = createHmac("sha256", secretBytes.length ? secretBytes : Buffer.alloc(0))
    .update(signedContent)
    .digest();

  return svixSignatureHeader
    .trim()
    .split(/\s+/)
    .map((candidate) => candidate.split(",")[1])
    .filter(Boolean)
    .some((sig) => {
      try {
        const sigBuf = Buffer.from(sig, "base64");
        return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
      } catch {
        return false;
      }
    });
}
