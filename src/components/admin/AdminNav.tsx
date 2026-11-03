"use client";

import { createContext, useContext, useState } from "react";
import { Menu } from "lucide-react";

const AdminNavContext = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} });
export const useAdminNav = () => useContext(AdminNavContext);

export function AdminNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <AdminNavContext.Provider value={{ open, setOpen }}>{children}</AdminNavContext.Provider>;
}

/** Hamburger shown at the left of every admin page header on phones. */
export function AdminMenuButton() {
  const { setOpen } = useAdminNav();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open menu"
      className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-700 active:bg-ink-100 md:hidden"
    >
      <Menu size={22} />
    </button>
  );
}
