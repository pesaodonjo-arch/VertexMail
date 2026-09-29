import type { EmailProvider } from "./types";
import { Smtp2goProvider } from "./smtp2go";
import { ResendProvider } from "./resend";
import { MailgunProvider } from "./mailgun";

export * from "./types";

let cached: EmailProvider | null = null;

export interface DomainProviderOverride {
  provider: "smtp2go" | "resend" | "mailgun";
  apiKey: string;
  mailgunDomain?: string; // required when provider === "mailgun"
}

function buildProvider(name: string, apiKey: string, mailgunDomain?: string): EmailProvider {
  switch (name) {
    case "smtp2go":
      return new Smtp2goProvider(apiKey);
    case "resend":
      return new ResendProvider(apiKey);
    case "mailgun":
      if (!mailgunDomain) throw new Error("mailgun_domain_missing");
      return new MailgunProvider(apiKey, mailgunDomain);
    default:
      throw new Error(`unknown_email_provider: ${name}`);
  }
}

/**
 * Returns the outgoing-mail provider to send with.
 *
 * With no argument: the platform-wide default from EMAIL_PROVIDER /
 * SMTP2GO_API_KEY (env vars), cached across calls — this is what every
 * domain uses unless it's configured its own.
 *
 * With `override`: a specific domain's own provider + API key, read from
 * domain_email_settings by the caller (see src/app/api/mail/send and
 * src/app/api/v1/send). NOT cached — each domain's credentials are only
 * used for that one call, never mixed with another domain's or the
 * platform default's cached instance.
 *
 * Add a new provider by writing an adapter file next to smtp2go.ts,
 * registering it in buildProvider() above, and adding it to the
 * `provider` check constraint on domain_email_settings — nothing else
 * in the app changes.
 */
export function getEmailProvider(override?: DomainProviderOverride): EmailProvider {
  if (override) {
    return buildProvider(override.provider, override.apiKey, override.mailgunDomain);
  }

  if (cached) return cached;

  const providerName = process.env.EMAIL_PROVIDER ?? "smtp2go";
  cached = buildProvider(providerName, process.env.SMTP2GO_API_KEY!);
  return cached;
}
