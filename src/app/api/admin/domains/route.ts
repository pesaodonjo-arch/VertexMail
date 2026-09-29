import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Uses the session-bound server client (not the admin/service-role
// client) so RLS decides what the caller may see or insert: platform
// admins get every domain, domain admins get only their assigned ones,
// and the `domains_write` policy blocks non-platform-admins from inserting.

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
  const { domain_name } = await req.json();

  if (!domain_name || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain_name)) {
    return NextResponse.json({ error: "invalid_domain" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("domains")
    .insert({ domain_name: domain_name.toLowerCase() })
    .select("id, domain_name, status, verification_token")
    .single();

  // RLS (domains_write: platform admins only) turns an unauthorized
  // insert into a Postgres permission error here, not a leaked row.
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

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
