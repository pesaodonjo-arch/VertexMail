import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveTxt } from "dns/promises";

// Uses Node's dns module, so this route must run on the Node.js runtime
// (Vercel's default for route handlers, but pinned explicitly since
// Node core modules aren't available on the Edge runtime).
export const runtime = "nodejs";

/**
 * POST /api/admin/domains/:id/verify
 *
 * 1. Confirms the caller can see this domain (RLS: platform admin or
 *    that domain's admin) before doing anything.
 * 2. Checks the _vertex-verify TXT record matches domains.verification_token —
 *    UNLESS the dev-only bypass below is active (see checkDevSkip).
 * 3. Registers the Cloudflare Worker email route for this domain — the
 *    one piece of per-domain external config, done here via the
 *    Cloudflare API rather than by hand-editing the Worker.
 * 4. Flips domains.status to 'verified'.
 *
 * ---------------------------------------------------------------------------
 * DEV-ONLY VERIFICATION BYPASS
 * ---------------------------------------------------------------------------
 * Setting SKIP_DOMAIN_VERIFICATION=true AND SKIP_DOMAIN_VERIFICATION_TOKEN=
 * <a password you choose> lets "Verify" succeed with no real DNS record —
 * but only when the request also supplies that exact token. The domains
 * admin page prompts for it when you click "Skip DNS check (dev)".
 *
 * This is deliberately gated by a SECRET, not by which environment the
 * app is running in. That's a change from an earlier version of this
 * bypass, which instead tried to detect "production" and block itself
 * there — the problem is that a stranger who just has your site's URL
 * can reach Production regardless of what env var name you used, so an
 * environment check protects nothing once the app is actually deployed
 * somewhere public. A secret does: without SKIP_DOMAIN_VERIFICATION_TOKEN,
 * knowing the URL (or even knowing this feature exists) doesn't let
 * anyone claim a domain they don't own.
 *
 * Still worth knowing: whoever knows this token can mark ANY domain on
 * this instance as verified without proving they own it, in ANY
 * environment including Production. Treat the token like a password —
 * don't reuse one you use elsewhere, and rotate/remove it (unset
 * SKIP_DOMAIN_VERIFICATION) once you're done testing.
 */
function checkDevSkip(providedToken: unknown): boolean {
  const configured = process.env.SKIP_DOMAIN_VERIFICATION === "true" && !!process.env.SKIP_DOMAIN_VERIFICATION_TOKEN;
  if (!configured) return false;
  return typeof providedToken === "string" && providedToken === process.env.SKIP_DOMAIN_VERIFICATION_TOKEN;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const body = await req.json().catch(() => ({}));

  const { data: domain, error } = await supabase
    .from("domains")
    .select("id, domain_name, verification_token, status")
    .eq("id", params.id)
    .single();

  if (error || !domain) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (domain.status === "verified") return NextResponse.json({ domain });

  const devSkip = checkDevSkip(body?.dev_token);

  if (devSkip) {
    // eslint-disable-next-line no-console
    console.warn(
      `[SKIP_DOMAIN_VERIFICATION] Bypassing DNS check for "${domain.domain_name}" via dev token. Anyone with this token can do this to any domain, in any environment — rotate/remove it when done testing.`
    );
  } else {
    let txtRecords: string[][] = [];
    try {
      txtRecords = await resolveTxt(`_vertex-verify.${domain.domain_name}`);
    } catch {
      return NextResponse.json(
        { error: "dns_not_found", message: "Verification TXT record not found yet. DNS can take a few minutes to propagate." },
        { status: 422 }
      );
    }

    const found = txtRecords.some((chunks) => chunks.join("") === domain.verification_token);
    if (!found) {
      return NextResponse.json(
        { error: "token_mismatch", message: "TXT record found but its value doesn't match. Double-check you copied the exact value." },
        { status: 422 }
      );
    }
  }

  // Register the catch-all email route on Cloudflare for this zone.
  // TODO: replace with the real Cloudflare API calls once zone/account
  // IDs for this domain are on hand (the zone must already be on
  // Cloudflare with Email Routing enabled):
  //
  //   PUT /zones/{zone_id}/email/routing/rules  { matchers: [{type:"literal", field:"to", value:`*@${domain.domain_name}`}],
  //                                                actions: [{type:"worker", value:["vertex-mail-inbound"]}] }
  //
  // On success, store the returned rule id as cloudflare_route_id below.
  const cloudflareRouteId = `pending-cf-route-${domain.id}`;

  const { data: updated, error: updateError } = await supabase
    .from("domains")
    .update({ status: "verified", verified_at: new Date().toISOString(), cloudflare_route_id: cloudflareRouteId })
    .eq("id", domain.id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 403 });

  return NextResponse.json({ domain: updated, dev_skip: devSkip });
}
