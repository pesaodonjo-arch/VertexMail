import type { EmailProvider, OutboundMessage, SendResult, DkimRecord } from "./types";

/**
 * Mailgun adapter. Unlike SMTP2GO/Resend, Mailgun's send endpoint is
 * scoped to a specific domain registered in the caller's Mailgun account
 * (https://api.mailgun.net/v3/<mailgunDomain>/messages), so this adapter
 * needs that domain name in addition to the API key — both come from
 * domain_email_settings (provider = 'mailgun' stores mailgun_domain too).
 * A domain admin's own key/domain, never the platform-wide env vars.
 */
export class MailgunProvider implements EmailProvider {
  readonly name = "mailgun";
  private apiKey: string;
  private mailgunDomain: string;

  constructor(apiKey: string, mailgunDomain: string) {
    this.apiKey = apiKey;
    this.mailgunDomain = mailgunDomain;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    // multipart/form-data so attachments can ride along with the message.
    const form = new FormData();
    form.set("from", message.fromName ? `${message.fromName} <${message.from}>` : message.from);
    message.to.forEach((addr) => form.append("to", addr));
    (message.cc ?? []).forEach((addr) => form.append("cc", addr));
    (message.bcc ?? []).forEach((addr) => form.append("bcc", addr));
    form.set("subject", message.subject);
    if (message.text) form.set("text", message.text);
    if (message.html) form.set("html", message.html);
    if (message.inReplyTo) form.set("h:In-Reply-To", message.inReplyTo);
    for (const [header, value] of Object.entries(message.headers ?? {})) {
      form.set(`h:${header}`, value);
    }
    for (const a of message.attachments ?? []) {
      const bytes = Buffer.from(a.contentBase64, "base64");
      form.append("attachment", new Blob([bytes], { type: a.contentType }), a.fileName);
    }

    // No Content-Type header: fetch sets multipart/form-data with the boundary.
    const res = await fetch(`https://api.mailgun.net/v3/${this.mailgunDomain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${this.apiKey}`).toString("base64")}`,
      },
      body: form,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(`mailgun_send_failed: ${data?.message ?? JSON.stringify(data)}`);
    }

    return { providerMessageId: data.id as string };
  }

  async getDkimRecords(domain: string): Promise<DkimRecord[]> {
    // Mailgun's Domains API returns real DKIM/SPF values once a domain is
    // added to the account. Documented stub, same shape as the other
    // adapters — the admin UI links to Mailgun's own dashboard for now.
    return [
      { type: "TXT", host: `smtp._domainkey.${domain}`, value: "<add domain in Mailgun dashboard to get this>" },
      { type: "TXT", host: domain, value: "v=spf1 include:mailgun.org ~all" },
    ];
  }
}
