"use client";

import { MenuButton } from "./MobileNav";

export function FolderHeader({ title, count }: { title: string; count?: number }) {
  return (
    <header className="sticky top-0 z-10 border-b border-ink-200 bg-white/95 backdrop-blur vx-safe-top">
      <div className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-3.5">
        <MenuButton />
        <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-ink-900">{title}</h1>
        {typeof count === "number" && <span className="shrink-0 text-sm text-ink-400">{count}</span>}
      </div>
    </header>
  );
}
