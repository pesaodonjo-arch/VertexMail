export interface OutboundAttachment {
  fileName: string;
  contentType: string;
  contentBase64: string;
}

export interface OutboundMessage {
  from: string; // full address, e.g. admin1@darasa.site
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: OutboundAttachment[];
  inReplyTo?: string; // RFC Message-ID this is replying to, for threading headers
  headers?: Record<string, string>;
}

export interface SendResult {
  providerMessageId: string;
}

export interface DkimRecord {
  type: "TXT" | "CNAME";
  host: string;
  value: string;
}

/**
 * Every outgoing-mail provider (SMTP2GO, Postmark, Resend, SES, ...)
 * implements this. The rest of the app — the send API, the compose UI's
 * server action — only ever talks to this interface, so swapping
 * providers is a one-file change (write the adapter, flip EMAIL_PROVIDER).
 */
export interface EmailProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<SendResult>;
  /** Optional: DNS records the provider needs for a domain to send DKIM-signed mail. */
  getDkimRecords?(domain: string): Promise<DkimRecord[]>;
}
