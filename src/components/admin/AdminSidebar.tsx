"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Globe, Mailbox, Users, KeyRound, BarChart3, Inbox } from "lucide-react";
import clsx from "clsx";
import { VertexMark } from "@/components/ui/VertexMark";
import { SignOutButton } from "@/components/mail/SignOutButton";
import { AccountSwitcher } from "@/components/accounts/AccountSwitcher";

const items = [
  { href: "/admin", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/admin/domains", label: "Domains", icon: Globe },
  { href: "/admin/mailboxes", label: "Mailboxes", icon: Mailbox },
  { href: "/admin/users", label: "Admin users", icon: Users },
  { href: "/admin/api-keys", label: "API keys", icon: KeyRound },
  { href: "/admin/usage", label: "Usage", icon: BarChart3 },
];

export function AdminSidebar({ hasMailbox, userId, accountLabel }: { hasMailbox: boolean; userId: string; accountLabel: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-ink-950 text-ink-100">
      <div className="flex items-center gap-2 px-5 py-5">
        <VertexMark size={26} />
        <div>
          <p className="font-display text-sm font-bold text-white">Vertex Mail</p>
          <p className="text-[11px] text-ink-400">Admin</p>
        </div>
      </div>

      <nav className="mt-4 flex-1 space-y-0.5 px-3">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href} href={href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                active ? "bg-white/10 text-white" : "text-ink-400 hover:bg-white/5 hover:text-ink-100"
              )}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-white/10 px-4 py-4">
        {hasMailbox ? (
          <Link
            href="/inbox"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
          >
            <Inbox size={16} /> Switch to Mailbox
          </Link>
        ) : (
          <div>
            <p className="text-xs text-ink-500">
              You don't have a mailbox yet — create one to send and receive mail yourself.
            </p>
            <Link href="/admin/mailboxes" className="mt-1 block text-xs font-medium text-brand-300 hover:text-brand-200">
              Set up my mailbox →
            </Link>
          </div>
        )}
        <AccountSwitcher currentUserId={userId} currentLabel={accountLabel} tone="dark" />
        <SignOutButton />
      </div>
    </aside>
  );
}
