import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const domainId = req.nextUrl.searchParams.get("domain_id");

  let query = supabase
    .from("mailboxes")
    .select("id, domain_id, local_part, display_name, status, storage_used_bytes, created_at, auth_user_id, domains(domain_name)")
    .order("created_at", { ascending: false });

  if (domainId) query = query.eq("domain_id", domainId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // A mailbox created "for myself" (see POST below) shares its auth_user_id
  // with an admin's own login — resetting ITS password would silently
  // change that admin's login password too. Flag it so the UI can disable
  // "Reset password" there and point to Account settings instead, which
  // resets only that one login the normal way. Uses the admin client
  // deliberately: platform_admins/domain_admins RLS only lets a caller see
  // rows they're allowed to see (a domain admin can't read another
  // domain admin's row), which would make this flag silently wrong for
  // anyone who isn't a platform admin. This is metadata about WHETHER a
  // link exists, not the mailbox content itself, so reading it broadly
  // here is fine — mailboxes_select RLS above still scopes which
  // mailboxes this caller sees at all.
  const admin = createAdminClient();
  const [{ data: platformAdmins }, { data: domainAdmins }] = await Promise.all([
    admin.from("platform_admins").select("auth_user_id"),
    admin.from("domain_admins").select("auth_user_id"),
  ]);
  const adminUserIds = new Set([
    ...(platformAdmins ?? []).map((a) => a.auth_user_id),
    ...(domainAdmins ?? []).map((a) => a.auth_user_id),
  ]);

  const mailboxes = (data ?? []).map(({ auth_user_id, ...rest }) => ({
    ...rest,
    is_admin_linked: adminUserIds.has(auth_user_id),
  }));

  return NextResponse.json({ mailboxes });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { domain_id, local_part, display_name, temporary_password, for_self } = await req.json();

  if (!domain_id || !local_part || !/^[a-z0-9._-]+$/i.test(local_part)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Confirm the caller may administer this domain (RLS re-checked below
  // regardless, but a clear 403 here beats a confusing insert failure).
  const { data: domain } = await supabase
    .from("domains")
    .select("id, domain_name, status")
    .eq("id", domain_id)
    .maybeSingle();

  if (!domain) return NextResponse.json({ error: "domain_not_found_or_forbidden" }, { status: 404 });
  if (domain.status !== "verified") {
    return NextResponse.json({ error: "domain_not_verified" }, { status: 422 });
  }

  const email = `${local_part.toLowerCase()}@${domain.domain_name}`;

  // "This is my own mailbox": attach the mailbox to the admin's EXISTING login
  // instead of creating a second account. One sign-in then has both the admin
  // panel and an inbox, and switching between them is just a link. (Without
  // this, "create a mailbox" always mints a separate login with its own
  // password, which is the right thing for other people but not for yourself.)
  if (for_self) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: existing } = await supabase
      .from("mailboxes")
      .select("id, local_part, domains(domain_name)")
      .eq("auth_user_id", user.id)
      .neq("status", "deleted")
      .maybeSingle();
    if (existing) {
      const addr = `${existing.local_part}@${(existing as any).domains?.domain_name}`;
      return NextResponse.json(
        { error: "already_has_mailbox", message: `You already have a mailbox (${addr}). Each login can have one.` },
        { status: 409 }
      );
    }

    const { data: mailbox, error: selfError } = await supabase
      .from("mailboxes")
      .insert({ domain_id, auth_user_id: user.id, local_part: local_part.toLowerCase(), display_name })
      .select()
      .single();
    if (selfError) {
      const status = selfError.message.includes("mailbox_quota_exceeded") ? 422 : 403;
      const message = selfError.message.includes("duplicate")
        ? "That address is already taken on this domain."
        : selfError.message;
      return NextResponse.json({ error: selfError.message, message }, { status });
    }
    return NextResponse.json({ mailbox, email, linked_to_you: true }, { status: 201 });
  }

  const password = temporary_password ?? crypto.randomUUID().slice(0, 12);

  // Creating the auth.users row requires the service-role client — but we
  // only reach this line after confirming (via the session client + RLS)
  // that the caller is allowed to manage this domain.
  const admin = createAdminClient();
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { vertex_mailbox: true },
  });

  if (authError || !authUser.user) {
    return NextResponse.json({ error: authError?.message ?? "auth_create_failed" }, { status: 400 });
  }

  // The mailbox row itself is still inserted through the session client,
  // so mailboxes_insert's RLS check (platform admin or that domain's
  // admin) applies here too — the auth-user creation above doesn't grant
  // any extra database privilege.
  const { data: mailbox, error: mailboxError } = await supabase
    .from("mailboxes")
    .insert({ domain_id, auth_user_id: authUser.user.id, local_part: local_part.toLowerCase(), display_name })
    .select()
    .single();

  if (mailboxError) {
    await admin.auth.admin.deleteUser(authUser.user.id); // roll back the orphaned auth user
    const status = mailboxError.message.includes("mailbox_quota_exceeded") ? 422 : 403;
    return NextResponse.json({ error: mailboxError.message }, { status });
  }

  return NextResponse.json(
    { mailbox, email, temporary_password: password, note: "Share this password securely; it is not stored or shown again." },
    { status: 201 }
  );
}
