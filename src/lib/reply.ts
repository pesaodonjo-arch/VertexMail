// Pure helpers (no I/O) for building reply/forward drafts and for matching
// an incoming "Re: ..." message back to its conversation.

const PREFIX_RE = /^\s*((re|fwd?|aw|sv)\s*(\[\d+\])?\s*:\s*)+/i;
const REPLY_PREFIX_RE = /^\s*(re|aw|sv)\s*(\[\d+\])?\s*:/i;

/** "Re: Re: Fwd: Hello" -> "Hello" */
export function stripSubjectPrefixes(subject: string): string {
  return (subject ?? "").replace(PREFIX_RE, "").trim();
}

/** Subject with any reply/forward prefixes removed, lowercased, for comparing threads. */
export function normalizeSubject(subject: string): string {
  return stripSubjectPrefixes(subject).toLowerCase();
}

/** True for "Re:" style subjects (a reply), false for fresh mail and forwards. */
export function hasReplyPrefix(subject: string): boolean {
  return REPLY_PREFIX_RE.test(subject ?? "");
}

export function replySubject(subject: string): string {
  const base = stripSubjectPrefixes(subject);
  return `Re: ${base || "(no subject)"}`;
}

export function forwardSubject(subject: string): string {
  const base = stripSubjectPrefixes(subject);
  return `Fwd: ${base || "(no subject)"}`;
}

/** Bare address from "Name <addr@x.com>" or "addr@x.com". */
export function extractEmail(from: string): string {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface QuotableMessage {
  from_address: string;
  to_addresses?: string[] | null;
  subject?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  created_at: string;
}

function plainBody(m: QuotableMessage, max = 5000): string {
  const text = m.body_text?.trim() || (m.body_html ? htmlToText(m.body_html) : "");
  return text.length > max ? text.slice(0, max) + "\n[…]" : text;
}

function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

export function buildReplyBody(m: QuotableMessage): string {
  const when = new Date(m.created_at).toUTCString();
  return `\n\nOn ${when}, ${m.from_address} wrote:\n${quote(plainBody(m))}`;
}

export function buildForwardBody(m: QuotableMessage): string {
  const when = new Date(m.created_at).toUTCString();
  return (
    `\n\n---------- Forwarded message ----------\n` +
    `From: ${m.from_address}\n` +
    `Date: ${when}\n` +
    `Subject: ${m.subject ?? ""}\n` +
    `To: ${(m.to_addresses ?? []).join(", ")}\n\n` +
    plainBody(m)
  );
}
