import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/api-keys";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const domainId = req.nextUrl.searchParams.get("domain_id");

  let query = supabase
    .from("api_keys")
    .select("id, domain_id, name, key_prefix, status, created_at, last_used_at, domains(domain_name)")
    .order("created_at", { ascending: false });

  if (domainId) query = query.eq("domain_id", domainId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ api_keys: data }); // note: key_hash is never selected/returned
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { domain_id, name } = await req.json();

  if (!domain_id || !name) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { raw, prefix, hash } = generateApiKey();

  const { data, error } = await supabase
    .from("api_keys")
    .insert({ domain_id, name, key_prefix: prefix, key_hash: hash, created_by: user?.id })
    .select("id, domain_id, name, key_prefix, status, created_at")
    .single();

  // RLS (api_keys_write: platform admin or that domain's admin) rejects
  // an attempt to mint a key for a domain the caller doesn't administer.
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  return NextResponse.json(
    { api_key: data, secret: raw, note: "Copy this now — it will not be shown again." },
    { status: 201 }
  );
}
