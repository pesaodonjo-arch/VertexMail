import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET lists domain-admin assignments (platform admin sees all, via RLS on
// domain_admins_select). POST assigns an existing mailbox/auth user as a
// domain admin for a domain — restricted to platform admins by
// domain_admins_write's RLS policy, so a domain admin can't grant itself
// (or anyone else) rights over a domain it doesn't already own.
export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("domain_admins")
    .select("id, auth_user_id, domain_id, created_at, domains(domain_name)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ domain_admins: data });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { email, domain_id } = await req.json();

  if (!email || !domain_id) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  // Look up the auth user by email via a mailbox row (domain admins in
  // this scaffold are existing mailbox owners promoted to also admin a
  // domain; for a platform-team member with no mailbox, create them via
  // Supabase Auth first, then call this route with their user id instead).
  const { data: mailbox } = await supabase
    .from("mailboxes")
    .select("auth_user_id, local_part, domains(domain_name)")
    .eq("local_part", email.split("@")[0].toLowerCase())
    .eq("domain_id", domain_id)
    .maybeSingle();

  if (!mailbox) {
    return NextResponse.json({ error: "no_matching_mailbox", message: "Create a mailbox for this person first, then promote them." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("domain_admins")
    .insert({ auth_user_id: mailbox.auth_user_id, domain_id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ domain_admin: data }, { status: 201 });
}
