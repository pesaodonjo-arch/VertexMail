// Sender ("display") name rules, shared by the admin API and the send route.
//
// The sender name is what recipients see next to the address, e.g.
//   Fred Mark <fred@example.com>
// instead of just fred@example.com.

export const MAX_SENDER_NAME_LENGTH = 80;

// ok=false carries a human-readable message; ok=true carries the cleaned value (null = no name).
export type SenderNameResult = { ok: boolean; value: string | null; message: string };

/** Validates and tidies a sender name typed by an admin. Empty = clear it (falls back to the plain address). */
export function cleanSenderName(input: unknown): SenderNameResult {
  if (input === null || input === undefined) return { ok: true, value: null, message: "" };
  if (typeof input !== "string") return { ok: false, value: null, message: "Sender name must be text." };

  // Newlines / control characters could be used to inject extra email headers, so flatten them.
  const value = input.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (value === "") return { ok: true, value: null, message: "" };
  if (value.length > MAX_SENDER_NAME_LENGTH) {
    return { ok: false, value: null, message: `Sender name can be at most ${MAX_SENDER_NAME_LENGTH} characters.` };
  }
  if (/[<>"]/.test(value)) {
    return { ok: false, value: null, message: 'Sender name can\'t contain < > or " characters.' };
  }
  return { ok: true, value, message: "" };
}

/**
 * Formats a stored name for the From header. Names containing characters that
 * are special in email addresses (commas, periods, parentheses, @ ...) must be
 * quoted, e.g. "Mark, Fred" or "Fred M. Mark", or mail servers may misread them.
 */
export function formatFromName(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  if (/[()\[\]:;@\\,.]/.test(name)) return `"${name.replace(/\\/g, "\\\\")}"`;
  return name;
}
