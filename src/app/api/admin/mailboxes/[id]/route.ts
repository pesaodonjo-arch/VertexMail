import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";
import { cleanSenderName } from "@/lib/sender-name";

// PATCH { display_name: "Fred Mark" | "" } — set/clear the sender name shown
// to recipients next to the address ("" clears it, falling back to the plain address).
// PATCH { status: "suspended" | "active" } — suspend/reactivate a mailbox.
// PATCH { reset_password: true } — issue a new temporary password (the
// owner forgot theirs; there's no self-serve "forgot password" email flow
// yet, so this is the recovery path). Both use the SESSION client for the
// mailboxes update (mailboxes_update RLS already gates who may call this —
// platform admin or that domain's admin), then step up to the admin client
// only for the actual Supabase Auth operation, which RLS can't reach.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const body = await req.json();

  if ("display_name" in body) {
    const cleaned = cleanSenderName(body.display_name);
    if (!cleaned.ok) return NextResponse.json({ error: "invalid_display_name", message: cleaned.message }, { status: 400 });

    // Session client: the mailboxes_update RLS policy decides whether this
    // caller may edit this mailbox (platform admin or that domain's admin).
    const { data: mailbox, error } = await supabase
      .from("mailboxes")
      .update({ display_name: cleaned.value })
      .eq("id", params.id)
      .select("id, display_name")
      .single();

    if (error || !mailbox) return NextResponse.json({ error: error?.message ?? "not_found" }, { status: 403 });
    return NextResponse.json({ mailbox });
  }

  if (body.reset_password) {
    const { data: mailbox, error } = await supabase
      .from("mailboxes")
      .select("id, auth_user_id, local_part, domains(domain_name)")
      .eq("id", params.id)
      .single();

    if (error || !mailbox) return NextResponse.json({ error: error?.message ?? "not_found" }, { status: 403 });

    const admin = createAdminClient();

    // Enforced here, not just hidden in the UI: a mailbox created "for
    // myself" shares its auth_user_id with an admin's own login, so
    // resetting it here would silently change that admin's login
    // password too. That admin resets their own password from Account
    // settings instead — this endpoint refuses outright rather than
    // risk locking out someone else's admin access.
    const [{ data: isPlatformAdmin }, { data: isDomainAdmin }] = await Promise.all([
      admin.from("platform_admins").select("id").eq("auth_user_id", mailbox.auth_user_id).maybeSingle(),
      admin.from("domain_admins").select("id").eq("auth_user_id", mailbox.auth_user_id).maybeSingle(),
    ]);
    if (isPlatformAdmin || isDomainAdmin) {
      return NextResponse.json(
        {
          error: "mailbox_linked_to_admin",
          message: "This mailbox is linked to an admin's own login. They can change their password from Account settings — resetting it here isn't allowed, since it would also change their admin sign-in.",
        },
        { status: 409 }
      );
    }

    const newPassword = randomBytes(9).toString("base64url"); // 12-char temp password, shown once
    const { error: authError } = await admin.auth.admin.updateUserById(mailbox.auth_user_id, { password: newPassword });
    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });

    const email = `${mailbox.local_part}@${(mailbox as any).domains?.domain_name}`;
    return NextResponse.json({ email, temporary_password: newPassword });
  }

  const { status } = body;

  if (!["active", "suspended"].includes(status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const { data: mailbox, error } = await supabase
    .from("mailboxes")
    .update({ status, suspended_at: status === "suspended" ? new Date().toISOString() : null })
    .eq("id", params.id)
    .select("id, auth_user_id, status")
    .single();

  if (error || !mailbox) return NextResponse.json({ error: error?.message ?? "not_found" }, { status: 403 });

  // Actually lock out sign-in at the auth layer too, not just the app
  // layer, in case anything ever bypasses the mailbox status check.
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(mailbox.auth_user_id, {
    ban_duration: status === "suspended" ? "876000h" : "none", // ~100 years / lift ban
  });

  return NextResponse.json({ mailbox });
}

// DELETE — soft-deletes the mailbox row (status='deleted', frees the
// local_part for reuse is intentionally NOT automatic) and permanently
// disables sign-in. Mail rows are retained for the retention window
// (see Admin → Domains → data retention) then purged by a scheduled job.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: mailbox, error } = await supabase
    .from("mailboxes")
    .update({ status: "deleted" })
    .eq("id", params.id)
    .select("id, auth_user_id")
    .single();

  if (error || !mailbox) return NextResponse.json({ error: error?.message ?? "not_found" }, { status: 403 });

  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(mailbox.auth_user_id, { ban_duration: "876000h" });

  return NextResponse.json({ status: "deleted" });
}
