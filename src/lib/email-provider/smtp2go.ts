import type { EmailProvider, OutboundMessage, SendResult, DkimRecord } from "./types";

const SMTP2GO_SEND_URL = "https://api.smtp2go.com/v3/email/send";

/**
 * SMTP2GO adapter — the default outgoing provider. Uses SMTP2GO's HTTP
 * API (not raw SMTP) so the app has no long-lived SMTP connection to
 * manage. Swap this file out for another provider without touching
 * anything that calls send(); see src/lib/email-provider/index.ts.
 */
export class Smtp2goProvider implements EmailProvider {
  readonly name = "smtp2go";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const payload = {
      api_key: this.apiKey,
      sender: message.fromName ? `${message.fromName} <${message.from}>` : message.from,
      to: message.to,
      cc: message.cc ?? [],
      bcc: message.bcc ?? [],
      subject: message.subject,
      text_body: message.text,
      html_body: message.html,
      custom_headers: [
        ...(message.inReplyTo ? [{ header: "In-Reply-To", value: message.inReplyTo }] : []),
        ...Object.entries(message.headers ?? {}).map(([header, value]) => ({ header, value })),
      ],
      attachments: (message.attachments ?? []).map((a) => ({
        filename: a.fileName,
        fileblob: a.contentBase64,
        mimetype: a.contentType,
      })),
    };

    const res = await fetch(SMTP2GO_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok || data?.data?.succeeded !== 1) {
      const reason = data?.data?.failures?.[0] ?? data?.error ?? "unknown_provider_error";
      throw new Error(`smtp2go_send_failed: ${JSON.stringify(reason)}`);
    }

    return { providerMessageId: data.data.email_id as string };
  }

  async getDkimRecords(domain: string): Promise<DkimRecord[]> {
    // SMTP2GO issues per-domain DKIM keys via their "verified senders" /
    // domain API. Call it here and map the response into DkimRecord[].
    // Left as a documented stub: the shape below is what the domain
    // verification UI (Admin → Domains → DNS records) expects back.
    return [
      { type: "TXT", host: `smtp2go._domainkey.${domain}`, value: "<fetch from SMTP2GO domain API>" },
      { type: "TXT", host: domain, value: "v=spf1 include:spf.smtp2go.com ~all" },
    ];
  }
}
