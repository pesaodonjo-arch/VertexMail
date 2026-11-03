"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, PenSquare, Power, Shield, UserRound, X } from "lucide-react";
import clsx from "clsx";
import { folders } from "./folders";
import { VertexMark } from "@/components/ui/VertexMark";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { AccountSwitcher } from "@/components/accounts/AccountSwitcher";
import { useNotifications } from "@/components/notifications/NotificationProvider";

const NavContext = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} });
export const useMobileNav = () => useContext(NavContext);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <NavContext.Provider value={{ open, setOpen }}>{children}</NavContext.Provider>;
}

/** Hamburger shown at the left of every page header on mobile. */
export function MenuButton() {
  const { setOpen } = useMobileNav();
  const { unread } = useNotifications();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open menu"
      className="relative -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-700 active:bg-ink-100 md:hidden"
    >
      <Menu size={22} />
      {unread > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-600" />}
    </button>
  );
}

/** Gmail-style slide-in drawer from the left. Mobile only. */
export function MobileDrawer({ isAdmin, mailboxAddress, userId }: { isAdmin: boolean; mailboxAddress: string; userId: string }) {
  const { open, setOpen } = useMobileNav();
  const pathname = usePathname();
  const { unread, restartApp } = useNotifications();
  const touchStartX = useRef<number | null>(null);

  // Close after navigating.
  useEffect(() => { setOpen(false); }, [pathname, setOpen]);

  // Escape closes; page behind doesn't scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, setOpen]);

  const linkClass = (active: boolean) =>
    clsx(
      "mr-3 flex items-center gap-4 rounded-r-full px-5 py-3 text-[15px] font-medium",
      active ? "bg-brand-100 text-brand-700" : "text-ink-700 active:bg-ink-100"
    );

  return (
    <div className={clsx("fixed inset-0 z-40 md:hidden", !open && "pointer-events-none")} aria-hidden={!open}>
      <div
        onClick={() => setOpen(false)}
        className={clsx("absolute inset-0 bg-ink-950/50 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}
      />
      <aside
        role="dialog"
        aria-label="Mail navigation"
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchStartX.current !== null && touchStartX.current - e.changedTouches[0].clientX > 60) setOpen(false);
          touchStartX.current = null;
        }}
        className={clsx(
          "absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] flex-col bg-white shadow-2xl",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="vx-safe-top">
          <div className="flex items-center gap-2 px-5 py-4">
            <VertexMark size={26} />
            <span className="font-display text-base font-bold text-ink-900">Vertex Mail</span>
            <button
              type="button" onClick={() => setOpen(false)} aria-label="Close menu"
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-ink-500 active:bg-ink-100"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="px-4 pb-3">
          <Link
            href="/compose"
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-600 text-[15px] font-semibold text-white shadow-lg shadow-brand-600/25 active:bg-brand-700"
          >
            <PenSquare size={18} /> Compose
          </Link>
        </div>

        <nav className="vx-scroll flex-1 overflow-y-auto py-1" aria-label="Mail folders">
          {folders.map(({ href, label, icon: Icon, showUnread }) => {
            const active = pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={linkClass(active)}>
                <Icon size={20} />
                <span className="flex-1">{label}</span>
                {showUnread && unread > 0 && (
                  <span className={clsx("text-xs font-semibold", active ? "text-brand-700" : "text-ink-500")}>
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            );
          })}

          <div className="my-2 border-t border-ink-100" />

          <Link href="/account" className={linkClass(pathname.startsWith("/account"))}>
            <UserRound size={20} /> Account &amp; notifications
          </Link>
          {isAdmin && (
            <Link href="/admin" className={linkClass(false)}>
              <Shield size={20} /> Switch to Admin
            </Link>
          )}
          <button type="button" onClick={() => void restartApp()} className={clsx(linkClass(false), "w-[calc(100%-0.75rem)] text-left")}>
            <Power size={20} /> Restart app
          </button>
        </nav>

        <div className="vx-safe-bottom space-y-2 border-t border-ink-100 px-4 py-3">
          <ThemeSwitcher />
          <AccountSwitcher currentUserId={userId} currentLabel={mailboxAddress} />
        </div>
      </aside>
    </div>
  );
}

/** Floating Compose button on folder pages (mobile), replacing the old bottom tab bar. */
export function MobileComposeFab() {
  const pathname = usePathname();
  const onFolderPage = folders.some((f) => f.href !== "/search" && pathname.startsWith(f.href));
  if (!onFolderPage) return null;
  return (
    <Link
      href="/compose"
      aria-label="Compose"
      className="fixed right-4 z-30 flex h-14 items-center gap-2 rounded-2xl bg-brand-600 px-5 text-[15px] font-semibold text-white shadow-lg shadow-brand-600/30 active:scale-95 md:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 2.75rem)" }}
    >
      <PenSquare size={20} /> Compose
    </Link>
  );
}
