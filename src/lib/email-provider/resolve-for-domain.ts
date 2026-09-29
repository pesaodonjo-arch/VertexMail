import type { SupabaseClient } from "@supabase/supabase-js";
import type { DomainProviderOverride } from "./index";

/**
 * Looks up domain_email_settings for a domain and returns an override to
 * pass to getEmailProvider() — or undefined if the domain hasn't set its
 * own provider, in which case the caller should fall back to the
 * platform default (getEmailProvider() with no argument).
 *
 * RLS on domain_email_settings is admin-only (see schema.sql), so this
 * must be called with the ADMIN client, not the caller's session client —
 * a mailbox owner sending mail isn't a domain admin and would get nothing
 * back under their own session, even though their domain's setting exists.
 */
export async function resolveDomainProvider(
  admin: SupabaseClient,
  domainId: string
): Promise<DomainProviderOverride | undefined> {
  const { data } = await admin
    .from("domain_email_settings")
    .select("provider, api_key, mailgun_domain")
    .eq("domain_id", domainId)
    .maybeSingle();

  if (!data || !data.api_key) return undefined;

  return {
    provider: data.provider as DomainProviderOverride["provider"],
    apiKey: data.api_key,
    mailgunDomain: data.mailgun_domain ?? undefined,
  };
}
