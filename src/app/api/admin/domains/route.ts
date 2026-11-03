import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET uses the session-bound server client, so RLS decides what the caller
// sees: platform admins get every domain, domain admins only their own.
//
// POST lets a domain admin add ANOTHER domain to their own login (e.g. one
// person running darasa.site and fluencyai.app from a single account). The
// `domains_write` policy is platform-admin-only by design, so the insert
// itself goes through the service-role client — but only after this route has
// confirmed the caller is a platform admin or an existing domain admin, and it
// links the new domain to that caller so they (and nobody else) can manage it.

export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("domains")
    .select("id, domain_name, status, max_mailboxes, created_at, verified_at, verification_token, mailboxes(count)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ domains: data });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const domain_name = typeof body?.domain_name === "string" ? body.domain_name.trim() : "";

  if (!domain_name || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain_name)) {
    return NextResponse.json(
      { error: "invalid_domain", message: "Enter a valid domain, like example.com." },
      { status: 400 }
    );
  }

  // Who is asking? Regular mailbox users (neither kind of admin) may not add domains.
  const { data: ctx } = await supabase.from("my_context").select("is_platform_admin, admin_domain_ids").single();
  const isPlatformAdmin = !!ctx?.is_platform_admin;
  const isDomainAdmin = (ctx?.admin_domain_ids?.length ?? 0) > 0;
  if (!isPlatformAdmin && !isDomainAdmin) {
    return NextResponse.json({ error: "forbidden", message: "Only admins can add domains." }, { status: 403 });
  }

  // Fail with a plain-English message if the server is misconfigured, instead
  // of a confusing "row-level security" error from the database.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json(
      {
        error: "server_misconfigured",
        message:
          "Server setup problem: SUPABASE_SERVICE_ROLE_KEY is missing or is set to the anon key. In Vercel, set it to the service_role key from Supabase (Project Settings -> API), then redeploy.",
      },
      { status: 500 }
    );
  }

  const admin = createAdminClient();
  const normalized = domain_name.toLowerCase();

  // First come, first served — same rule as signup.
  const { data: existing } = await admin.from("domains").select("id").eq("domain_name", normalized).maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "domain_taken", message: "That domain is already registered on Vertex Mail." },
      { status: 409 }
    );
  }

  const { data, error } = await admin
    .from("domains")
    .insert({ domain_name: normalized })
    .select("id, domain_name, status, verification_token")
    .single();
  if (error || !data) {
    if (error?.message.includes("row-level security")) {
      return NextResponse.json(
        {
          error: "server_misconfigured",
          message:
            "The database refused the insert even with the server key, so SUPABASE_SERVICE_ROLE_KEY in Vercel is not the real service_role key. Copy it again from Supabase (Project Settings -> API -> service_role) and redeploy.",
        },
        { status: 500 }
      );
    }
    const dup = error?.message.includes("duplicate");
    return NextResponse.json(
      { error: dup ? "domain_taken" : error?.message ?? "insert_failed", message: dup ? "That domain is already registered on Vertex Mail." : undefined },
      { status: dup ? 409 : 400 }
    );
  }

  // Domain admins manage the domain they just added; platform admins already see everything.
  if (!isPlatformAdmin) {
    const { error: linkError } = await admin
      .from("domain_admins")
      .insert({ auth_user_id: user.id, domain_id: data.id });
    if (linkError) {
      await admin.from("domains").delete().eq("id", data.id); // don't leave an orphan nobody can manage
      return NextResponse.json({ error: linkError.message }, { status: 400 });
    }
  }

  return NextResponse.json({
    domain: data,
    dns_records: [
      { type: "TXT", host: `_vertex-verify.${data.domain_name}`, value: data.verification_token },
      { type: "MX", host: data.domain_name, value: "route1.mx.cloudflare.net", priority: 10 },
      { type: "MX", host: data.domain_name, value: "route2.mx.cloudflare.net", priority: 20 },
      { type: "TXT", host: data.domain_name, value: "v=spf1 include:spf.smtp2go.com ~all" },
      { type: "TXT", host: `_dmarc.${data.domain_name}`, value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@" + data.domain_name },
    ],
  }, { status: 201 });
}
