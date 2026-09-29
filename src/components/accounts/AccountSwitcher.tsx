"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, LogOut, Plus, X } from "lucide-react";
import clsx from "clsx";
import type { SavedAccount } from "@/lib/accounts-store";
import {
  beginAddAccount,
  listAccounts,
  removeAccount,
  signOutAllAccounts,
  signOutCurrentAccount,
  switchToAccount,
} from "@/lib/accounts";

interface Props {
  currentUserId: string;
  currentLabel: string;
  /** "popover" = compact row that opens upward (sidebars). "list" = always-open card (Account page). */
  variant?: "popover" | "list";
  /** "dark" for the admin sidebar. */
  tone?: "light" | "dark";
}

function Avatar({ text, dark }: { text: string; dark?: boolean }) {
  return (
    <span
      className={clsx(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase",
        dark ? "bg-white/15 text-white" : "bg-brand-100 text-brand-700"
      )}
    >
      {text.trim().charAt(0) || "?"}
    </span>
  );
}

export function AccountSwitcher({ currentUserId, currentLabel, variant = "popover", tone = "light" }: Props) {
  const dark = tone === "dark";
  const [open, setOpen] = useState(variant === "list");
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => setAccounts(listAccounts());
  useEffect(() => { refresh(); }, [open]);

  const others = accounts.filter((a) => a.userId !== currentUserId);

  async function onSwitch(userId: string) {
    setBusy(userId);
    setError(null);
    const result = await switchToAccount(userId);
    if (!result.ok) {
      setBusy(null);
      refresh();
      setError(
        result.reason === "expired"
          ? "That account's sign-in expired, so it was removed. Use “Add another account” to sign in to it again."
          : "Couldn't find that account on this device."
      );
    }
    // On success the page reloads into the other account.
  }

  const row = clsx(
    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
    dark ? "text-ink-100 hover:bg-white/10" : "text-ink-700 hover:bg-ink-50"
  );

  const panel = (
    <div
      className={clsx(
        "space-y-0.5 p-1.5",
        variant === "popover" &&
          (dark
            ? "absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-white/10 bg-ink-900 shadow-panel"
            : "absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-ink-200 bg-white shadow-panel")
      )}
    >
      <div className={row + " cursor-default"}>
        <Avatar text={currentLabel} dark={dark} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{currentLabel}</span>
          <span className={clsx("block text-[11px]", dark ? "text-ink-400" : "text-ink-400")}>Current account</span>
        </span>
        <Check size={15} className="shrink-0 text-brand-500" />
      </div>

      {others.map((a) => (
        <div key={a.userId} className="group flex items-center">
          <button type="button" className={row} disabled={busy !== null} onClick={() => onSwitch(a.userId)}>
            <Avatar text={a.label} dark={dark} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{a.label}</span>
              {a.label !== a.email && <span className="block truncate text-[11px] text-ink-400">Login: {a.email}</span>}
            </span>
            {busy === a.userId && <span className="text-[11px] text-ink-400">Switching…</span>}
          </button>
          <button
            type="button"
            aria-label={`Remove ${a.label} from this device`}
            title="Remove from this device"
            className={clsx("ml-1 shrink-0 rounded-md p-1.5 text-ink-400", dark ? "hover:bg-white/10 hover:text-white" : "hover:bg-ink-100 hover:text-ink-700")}
            onClick={() => { removeAccount(a.userId); refresh(); }}
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {error && <p className="mx-2 my-1 rounded-md bg-accent-rose/10 px-2 py-1.5 text-xs text-accent-rose">{error}</p>}

      <button type="button" className={row} onClick={() => beginAddAccount()}>
        <span className={clsx("flex h-7 w-7 items-center justify-center rounded-full border border-dashed", dark ? "border-white/30" : "border-ink-300")}>
          <Plus size={14} />
        </span>
        Add another account
      </button>
      <button type="button" className={row} onClick={() => signOutCurrentAccount()}>
        <LogOut size={15} className="ml-2 mr-1" /> Sign out of this account
      </button>
      {others.length > 0 && (
        <button type="button" className={row} onClick={() => signOutAllAccounts()}>
          <LogOut size={15} className="ml-2 mr-1" /> Sign out of all accounts
        </button>
      )}
    </div>
  );

  if (variant === "list") {
    return (
      <div className="rounded-xl border border-ink-200 bg-white p-2 shadow-panel">
        <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-ink-400">Accounts on this device</p>
        {panel}
      </div>
    );
  }

  return (
    <div className="relative">
      {open && panel}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={clsx(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
          dark ? "hover:bg-white/10" : "hover:bg-ink-50"
        )}
      >
        <Avatar text={currentLabel} dark={dark} />
        <span className={clsx("min-w-0 flex-1 truncate text-xs font-medium", dark ? "text-ink-100" : "text-ink-600")}>
          {currentLabel}
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-ink-400" />
      </button>
    </div>
  );
}
