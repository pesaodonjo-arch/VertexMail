"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ShieldAlert, ShieldCheck, Trash2, type LucideIcon } from "lucide-react";

type Target = "inbox" | "archive" | "trash" | "spam";

interface Action { label: string; aria: string; icon: LucideIcon; to: Target; goto: string }

/**
 * Archive / Spam / Trash for one conversation. Icon-only on phones, labelled on desktop.
 * In the Spam folder the spam button becomes "Not spam" and moves the conversation back to the Inbox.
 */
export function ThreadActions({ threadId, folder }: { threadId: string; folder: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions: Action[] = [];
  if (folder !== "archive") actions.push({ label: "Archive", aria: "Archive", icon: Archive, to: "archive", goto: "/inbox" });
  if (folder === "spam") actions.push({ label: "Not spam", aria: "Not spam — move to inbox", icon: ShieldCheck, to: "inbox", goto: "/spam" });
  else actions.push({ label: "Report spam", aria: "Report spam", icon: ShieldAlert, to: "spam", goto: "/inbox" });
  if (folder !== "trash") actions.push({ label: "Trash", aria: "Move to trash", icon: Trash2, to: "trash", goto: "/inbox" });

  async function move(a: Action) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/mail/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: a.to }),
      });
      if (!res.ok) throw new Error();
      router.push(a.goto);
      router.refresh(); // so the folder lists and unread badge reflect the move right away
    } catch {
      setError("Couldn't move that conversation. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-0.5">
        {actions.map((a) => (
          <button
            key={a.to}
            type="button"
            onClick={() => move(a)}
            disabled={busy}
            aria-label={a.aria}
            title={a.aria}
            className={
              "flex h-10 w-10 items-center justify-center rounded-full text-ink-600 active:bg-ink-100 disabled:opacity-50 " +
              "md:h-9 md:w-auto md:gap-1.5 md:rounded-lg md:px-3 md:text-sm md:font-medium md:hover:bg-ink-100"
            }
          >
            <a.icon size={19} />
            <span className="hidden md:inline">{a.label}</span>
          </button>
        ))}
      </div>
      {error && (
        <p className="absolute inset-x-0 top-full bg-accent-rose px-4 py-2 text-center text-sm text-white" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
