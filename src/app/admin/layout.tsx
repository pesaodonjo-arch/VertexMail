import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AccountSync } from "@/components/accounts/AccountSync";
import { PoweredBy } from "@/components/ui/PoweredBy";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // my_context resolves is_platform_admin / admin_domain_ids under RLS —
  // if neither is true, this user has no admin surface at all, mailbox
  // owner or not, and is bounced back to their inbox.
  const { data: ctx } = await supabase.from("my_context").select("*").single();
  const isPlatformAdmin = !!ctx?.is_platform_admin;
  const adminDomainIds: string[] = ctx?.admin_domain_ids ?? [];

  if (!isPlatformAdmin && adminDomainIds.length === 0) {
    redirect("/inbox");
  }

  // Whether this admin also has their own mailbox decides what "Back to
  // Mail" can actually do — see AdminSidebar for how it's used.
  const { data: ownMailbox } = await supabase
    .from("mailboxes")
    .select("id, local_part, domains(domain_name)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // What this account is called in the account switcher: its mailbox address
  // if it has one, otherwise the login email.
  const accountLabel = ownMailbox
    ? `${ownMailbox.local_part}@${(ownMailbox as any).domains?.domain_name}`
    : user.email ?? "";

  return (
    <div className="flex h-dvh bg-ink-50">
      <AccountSync userId={user.id} label={accountLabel} />
      <AdminSidebar hasMailbox={!!ownMailbox} userId={user.id} accountLabel={accountLabel} />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex-1">{children}</div>
        <PoweredBy />
      </div>
    </div>
  );
}
