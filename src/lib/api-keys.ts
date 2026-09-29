import { randomBytes, createHash } from "crypto";

/**
 * API keys are domain-scoped credentials for POST /api/v1/send. The raw
 * key is shown to the admin exactly once at creation time; only its
 * sha256 hash and a short display prefix are ever persisted, so a
 * database leak doesn't leak usable keys.
 */

const KEY_PREFIX = "vm_live_";

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString("base64url");
  const raw = `${KEY_PREFIX}${secret}`;
  return {
    raw,
    prefix: raw.slice(0, KEY_PREFIX.length + 6), // e.g. vm_live_8f2a91
    hash: hashApiKey(raw),
  };
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function looksLikeVertexApiKey(value: string): boolean {
  return value.startsWith(KEY_PREFIX) && value.length > KEY_PREFIX.length + 20;
}
