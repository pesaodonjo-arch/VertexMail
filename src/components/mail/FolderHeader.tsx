"use client";

import { RefreshCw } from "lucide-react";
import clsx from "clsx";
import { MenuButton } from "./MobileNav";
import { useNotifications } from "@/components/notifications/NotificationProvider";

export function FolderHeader({ title, count }: { title: string; count?: number }) {
  const { refresh, refreshing } = useNotifications();
  return (
    <header className="sticky top-0 z-10 border-b border-ink-200 bg-white/95 backdrop-blur vx-safe-top">
      <div className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-3.5">
        <MenuButton />
        <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-ink-900">{title}</h1>
        {typeof count === "number" && <span className="shrink-0 text-sm text-ink-500">{count}</span>}
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          aria-label="Refresh"
          title="Refresh"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-600 hover:bg-ink-100 active:bg-ink-100 disabled:opacity-60"
        >
          <RefreshCw size={20} className={clsx(refreshing && "animate-spin")} />
        </button>
      </div>
    </header>
  );
}
