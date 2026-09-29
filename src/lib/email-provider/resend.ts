import type { EmailProvider, OutboundMessage, SendResult, DkimRecord } from "./types";

const RESEND_SEND_URL = "https://api.resend.com/emails";

/**
 * Resend adapter. A domain admin's own Resend API key (stored in
 * domain_email_settings, never the platform-wide env vars) is what gets
 * passed to the constructor — see src/lib/email-provider/index.ts for how
 * the per-domain override is resolved.
 */
export class ResendProvider implements EmailProvider {
  readonly name = "resend";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const payload = {
      from: message.fromName ? `${message.fromName} <${message.from}>` : message.from,
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: {
        ...(message.inReplyTo ? { "In-Reply-To": message.inReplyTo } : {}),
        ...(message.headers ?? {}),
      },
      attachments: (message.attachments ?? []).map((a) => ({
        filename: a.fileName,
        content: a.contentBase64,
      })),
    };

    const res = await fetch(RESEND_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(`resend_send_failed: ${data?.message ?? JSON.stringify(data)}`);
    }

    return { providerMessageId: data.id as string };
  }

  async getDkimRecords(domain: string): Promise<DkimRecord[]> {
    // Resend's Domains API (POST /domains, then GET /domains/:id) returns
    // the actual DKIM/SPF records to add once a domain is registered with
    // them — that registration call isn't made here, so this is a
    // documented stub matching SMTP2GO's, not a live lookup. The admin UI
    // links out to Resend's own dashboard for the real values today.
    return [
      { type: "TXT", host: `resend._domainkey.${domain}`, value: "<add domain in Resend dashboard to get this>" },
      { type: "TXT", host: domain, value: "v=spf1 include:amazonses.com ~all" },
    ];
  }
}
