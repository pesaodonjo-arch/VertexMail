"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Globe, Mailbox, Users, KeyRound, BarChart3, Inbox, X } from "lucide-react";
import clsx from "clsx";
import { VertexMark } from "@/components/ui/VertexMark";
import { SignOutButton } from "@/components/mail/SignOutButton";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { AccountSwitcher } from "@/components/accounts/AccountSwitcher";
import { useAdminNav } from "./AdminNav";

const items = [
  { href: "/admin", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/admin/domains", label: "Domains", icon: Globe },
  { href: "/admin/mailboxes", label: "Mailboxes", icon: Mailbox },
  { href: "/admin/users", label: "Admin users", icon: Users },
  { href: "/admin/api-keys", label: "API keys", icon: KeyRound },
  { href: "/admin/usage", label: "Usage", icon: BarChart3 },
];

interface Props {
  hasMailbox: boolean;
  userId: string;
  accountLabel: string;
}

/** Shared by the desktop sidebar and the phone drawer. */
function SidebarBody({ hasMailbox, userId, accountLabel, onClose }: Props & { onClose?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <div className="vx-safe-top">
        <div className="flex items-center gap-2 px-5 py-5">
          <VertexMark size={26} />
          <div>
            <p className="font-display text-sm font-bold text-white">Vertex Mail</p>
            <p className="text-[11px] text-ink-400">Admin</p>
          </div>
          {onClose && (
            <button
              type="button" onClick={onClose} aria-label="Close menu"
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-ink-300 active:bg-white/10"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      <nav className="vx-scroll mt-2 flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Admin sections">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href} href={href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                active ? "bg-white/10 text-white" : "text-ink-300 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="vx-safe-bottom space-y-3 border-t border-white/10 px-4 py-4">
        {hasMailbox ? (
          <Link
            href="/inbox"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
          >
            <Inbox size={16} /> Switch to Mailbox
          </Link>
        ) : (
          <div>
            <p className="text-xs text-ink-400">
              You don't have a mailbox yet — create one to send and receive mail yourself.
            </p>
            <Link href="/admin/mailboxes" className="mt-1 block text-xs font-medium text-brand-300 hover:text-brand-200">
              Set up my mailbox →
            </Link>
          </div>
        )}
        <ThemeSwitcher tone="dark" />
        <AccountSwitcher currentUserId={userId} currentLabel={accountLabel} tone="dark" />
        <SignOutButton />
      </div>
    </>
  );
}

/** Fixed sidebar — tablets and desktops only. */
export function AdminSidebar(props: Props) {
  return (
    <aside className="vx-keep hidden w-64 shrink-0 flex-col border-r border-white/5 bg-ink-950 text-ink-100 md:flex">
      <SidebarBody {...props} />
    </aside>
  );
}

/** Slide-in drawer — phones only. Opened by the hamburger in each page header. */
export function AdminDrawer(props: Props) {
  const { open, setOpen } = useAdminNav();
  const pathname = usePathname();
  const touchStartX = useRef<number | null>(null);

  useEffect(() => { setOpen(false); }, [pathname, setOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, setOpen]);

  return (
    <div className={clsx("fixed inset-0 z-40 md:hidden", !open && "pointer-events-none")} aria-hidden={!open}>
      <div
        onClick={() => setOpen(false)}
        className={clsx("absolute inset-0 bg-ink-950/60 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}
      />
      <aside
        role="dialog"
        aria-label="Admin navigation"
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchStartX.current !== null && touchStartX.current - e.changedTouches[0].clientX > 60) setOpen(false);
          touchStartX.current = null;
        }}
        className={clsx(
          "vx-keep absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] flex-col bg-ink-950 text-ink-100 shadow-2xl",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarBody {...props} onClose={() => setOpen(false)} />
      </aside>
    </div>
  );
}
