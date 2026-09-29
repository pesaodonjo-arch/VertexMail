"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PenSquare, Shield } from "lucide-react";
import clsx from "clsx";
import { VertexMark } from "@/components/ui/VertexMark";
import { Button } from "@/components/ui/Button";
import { AccountSwitcher } from "@/components/accounts/AccountSwitcher";
import { useNotifications } from "@/components/notifications/NotificationProvider";
import { folders } from "./folders";

export function DesktopSidebar({ mailboxAddress, isAdmin, userId }: { mailboxAddress: string; isAdmin: boolean; userId: string }) {
  const pathname = usePathname();
  const { unread } = useNotifications();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-200 bg-white md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <VertexMark size={26} />
        <span className="font-display text-base font-bold text-ink-900">Vertex Mail</span>
      </div>

      <div className="px-4">
        <Link href="/compose">
          <Button size="lg" className="w-full">
            <PenSquare size={17} /> Compose
          </Button>
        </Link>
      </div>

      <nav className="mt-6 flex-1 space-y-0.5 px-3">
        {folders.map(({ href, label, icon: Icon, showUnread }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href} href={href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                active ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-ink-50"
              )}
            >
              <Icon size={17} />
              <span className="flex-1">{label}</span>
              {showUnread && unread > 0 && (
                <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-ink-100 px-4 py-4">
        <AccountSwitcher currentUserId={userId} currentLabel={mailboxAddress} />
        <Link href="/account" className="block text-xs text-brand-600 hover:underline">
          Account settings
        </Link>
        {isAdmin && (
          <Link
            href="/admin"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
          >
            <Shield size={15} /> Switch to Admin
          </Link>
        )}
      </div>
    </aside>
  );
}
