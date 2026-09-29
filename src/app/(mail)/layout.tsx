import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DesktopSidebar } from "@/components/mail/DesktopSidebar";
import { MobileNavProvider, MobileDrawer, MobileComposeFab } from "@/components/mail/MobileNav";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { AccountSync } from "@/components/accounts/AccountSync";
import { PoweredBy } from "@/components/ui/PoweredBy";

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: mailbox } = await supabase
    .from("mailboxes")
    .select("id, local_part, domains(domain_name)")
    .eq("auth_user_id", user.id)
    .single();

  const { data: ctx } = await supabase.from("my_context").select("*").single();
  const isAdmin = !!ctx?.is_platform_admin || (ctx?.admin_domain_ids?.length ?? 0) > 0;

  // No mailbox on this account — likely a domain admin (or platform admin)
  // who has never had one, e.g. signed up via /signup. The mail UI has
  // nothing to show them; send them to the admin panel instead of a
  // permanently empty inbox. A confirmed account with neither a mailbox
  // nor any admin access falls through to the mail UI as before, since
  // there's nowhere better to send them.
  if (!mailbox && isAdmin) {
    redirect("/admin");
  }

  const address = mailbox ? `${mailbox.local_part}@${(mailbox as any).domains.domain_name}` : user.email ?? "";

  // Starting point for the unread badge; NotificationProvider keeps it live from here.
  let initialUnread = 0;
  if (mailbox) {
    const { count } = await supabase
      .from("threads")
      .select("id", { count: "exact", head: true })
      .eq("folder", "inbox")
      .eq("is_read", false);
    initialUnread = count ?? 0;
  }

  return (
    <MobileNavProvider>
      <NotificationProvider mailboxId={mailbox?.id} initialUnread={initialUnread}>
        {/* h-dvh (not h-screen) so the bottom of the page isn't hidden behind mobile browser toolbars */}
        <div className="flex h-dvh bg-ink-50">
          <AccountSync userId={user.id} label={address} />
          <DesktopSidebar mailboxAddress={address} isAdmin={isAdmin} userId={user.id} />
          <div className="flex min-w-0 flex-1 flex-col">
            {children}
            <PoweredBy />
          </div>
          <MobileDrawer isAdmin={isAdmin} mailboxAddress={address} userId={user.id} />
          <MobileComposeFab />
        </div>
      </NotificationProvider>
    </MobileNavProvider>
  );
}
