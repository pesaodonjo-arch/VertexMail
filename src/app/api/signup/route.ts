import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/signup
 *
 * Public route — no session required. Lets anyone who wants to run their
 * OWN domain on Vertex Mail sign themselves up as that domain's admin,
 * instead of a platform admin creating every domain and domain_admins
 * row by hand.
 *
 * This is deliberately the 4th place (alongside the 3 listed in
 * lib/supabase/admin.ts) that uses the service-role client: domains_write
 * and domain_admins_write both require is_platform_admin() by RLS design,
 * which is exactly right for every OTHER caller — a signed-in domain
 * admin still can't create a second domain or promote anyone else. Here
 * there is no session yet, so this route does its own checks instead of
 * relying on RLS, and only ever inserts rows tied to the single new user
 * it just created:
 *
 *   1. Validate input.
 *   2. Reject if the domain is already claimed (any status) — first
 *      come, first served on a domain name.
 *   3. Create the auth user.
 *   4. Create the domain (status: pending) and the domain_admins link,
 *      rolling back the auth user if either insert fails.
 *
 * Ownership itself isn't proven here — that still happens at
 * /api/admin/domains/:id/verify via the DNS TXT record, same as the
 * platform-admin-created flow. Signup only grants the *ability* to
 * attempt verification for that one domain; nothing mail-related works
 * until verification succeeds (mailbox creation already requires
 * status === "verified").
 */
export async function POST(req: NextRequest) {
  const { email, password, domain_name } = await req.json();

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "weak_password", message: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (typeof domain_name !== "string" || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain_name)) {
    return NextResponse.json({ error: "invalid_domain" }, { status: 400 });
  }

  const admin = createAdminClient();
  const normalizedDomain = domain_name.toLowerCase();

  // First come, first served — whether pending, verified, or suspended,
  // an existing row means this domain name is already someone's.
  const { data: existingDomain } = await admin
    .from("domains")
    .select("id")
    .eq("domain_name", normalizedDomain)
    .maybeSingle();

  if (existingDomain) {
    return NextResponse.json(
      { error: "domain_taken", message: "That domain is already registered on Vertex Mail." },
      { status: 409 }
    );
  }

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { vertex_domain_admin_signup: true },
  });

  if (authError || !authUser.user) {
    const status = authError?.message?.toLowerCase().includes("already") ? 409 : 400;
    return NextResponse.json({ error: authError?.message ?? "auth_create_failed" }, { status });
  }

  const { data: domain, error: domainError } = await admin
    .from("domains")
    .insert({ domain_name: normalizedDomain })
    .select("id, domain_name, status, verification_token")
    .single();

  if (domainError) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    const status = domainError.message.includes("duplicate") ? 409 : 400;
    return NextResponse.json({ error: domainError.message }, { status });
  }

  const { error: linkError } = await admin
    .from("domain_admins")
    .insert({ auth_user_id: authUser.user.id, domain_id: domain.id });

  if (linkError) {
    await admin.from("domains").delete().eq("id", domain.id);
    await admin.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: linkError.message }, { status: 400 });
  }

  return NextResponse.json(
    {
      domain,
      dns_records: [
        { type: "TXT", host: `_vertex-verify.${domain.domain_name}`, value: domain.verification_token },
        { type: "MX", host: domain.domain_name, value: "route1.mx.cloudflare.net", priority: 10 },
        { type: "MX", host: domain.domain_name, value: "route2.mx.cloudflare.net", priority: 20 },
        { type: "TXT", host: domain.domain_name, value: "v=spf1 include:spf.smtp2go.com ~all" },
        { type: "TXT", host: `_dmarc.${domain.domain_name}`, value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@" + domain.domain_name },
      ],
    },
    { status: 201 }
  );
}
