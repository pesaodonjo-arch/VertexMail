import { createClient } from "@/lib/supabase/server";
import { FolderHeader } from "@/components/mail/FolderHeader";
import { AccountSwitcher } from "@/components/accounts/AccountSwitcher";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";
import { ChangePasswordCard } from "@/components/accounts/ChangePasswordCard";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: mailbox } = await supabase
    .from("mailboxes")
    .select("local_part, display_name, created_at, domains(domain_name)")
    .eq("auth_user_id", user!.id)
    .single();

  const address = mailbox ? `${mailbox.local_part}@${(mailbox as any).domains.domain_name}` : user?.email;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <FolderHeader title="Account" />
      <div className="vx-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Signed in as</p>
          <p className="mt-1 text-base font-semibold text-ink-900">{address}</p>
          {mailbox?.display_name && <p className="text-sm text-ink-500">{mailbox.display_name}</p>}
        </div>

        <NotificationSettings />

        <ChangePasswordCard loginEmail={user!.email!} />

        <AccountSwitcher variant="list" currentUserId={user!.id} currentLabel={address ?? ""} />
      </div>
    </div>
  );
}
