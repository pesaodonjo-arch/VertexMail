import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS entirely — use it ONLY in these four
 * places, and always re-check permissions in application code first:
 *
 *   1. src/app/api/inbound/route.ts   — the Cloudflare Worker has no user
 *      session, so writing an incoming message has to bypass RLS; the
 *      route verifies INBOUND_WEBHOOK_SECRET and resolves the recipient
 *      mailbox by address before writing anything.
 *   2. src/app/api/v1/send/route.ts   — external API calls are
 *      authenticated by API key, not a Supabase session; the route
 *      verifies the key → domain → from-address match before sending.
 *   3. Platform-admin actions that must operate across every domain
 *      (e.g. suspending a mailbox), after confirming the caller is a
 *      platform admin via the session client.
 *   5. src/app/api/admin/domains/route.ts (POST) — lets an existing domain
 *      admin add another domain; the route confirms the caller is a platform
 *      or domain admin first, then links the new domain to them.
 *   4. src/app/api/signup/route.ts    — public self-service domain-admin
 *      signup has no session yet, so creating the auth user + domain +
 *      domain_admins link (normally platform-admin-only by RLS) has to
 *      bypass RLS here too; the route does its own validation (domain
 *      not already claimed) and only ever touches rows tied to the one
 *      new user it just created. Real access still requires the same
 *      DNS-ownership verification as the platform-admin-created flow.
 *
 * Never import this into a client component or return its client to the
 * browser. Never use it as a shortcut to skip writing an RLS policy.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
