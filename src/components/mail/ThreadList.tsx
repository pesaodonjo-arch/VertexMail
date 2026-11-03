"use client";

import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import clsx from "clsx";
import { Star, Paperclip } from "lucide-react";

export interface ThreadListItem {
  id: string;
  subject: string;
  preview?: string;
  counterparty?: string;
  is_read: boolean;
  is_starred: boolean;
  last_message_at: string;
  message_count: number;
  has_attachment?: boolean;
}

export function ThreadList({ threads, emptyLabel, emptyHint }: { threads: ThreadListItem[]; emptyLabel: string; emptyHint?: string }) {
  if (threads.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 py-24 text-center">
        <p className="font-display text-base font-semibold text-ink-700">{emptyLabel}</p>
        <p className="text-sm text-ink-500">{emptyHint ?? "New mail will show up here as it arrives."}</p>
      </div>
    );
  }

  return (
    <ul className="vx-scroll flex-1 divide-y divide-ink-100 overflow-y-auto">
      {threads.map((t) => (
        <li key={t.id}>
          <Link
            href={`/thread/${t.id}`}
            className={clsx(
              "flex items-start gap-3 px-4 py-3.5 active:bg-ink-50 md:hover:bg-ink-50",
              !t.is_read && "bg-brand-50/40"
            )}
          >
            <span
              className={clsx(
                "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                !t.is_read ? "bg-brand-600" : "bg-transparent"
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={clsx("truncate text-sm", !t.is_read ? "font-semibold text-ink-900" : "font-medium text-ink-700")}>
                  {t.counterparty ?? "Unknown sender"}
                </p>
                <span className="shrink-0 text-xs text-ink-500">
                  {formatDistanceToNowStrict(new Date(t.last_message_at), { addSuffix: false })}
                </span>
              </div>
              <p className={clsx("truncate text-sm", !t.is_read ? "text-ink-800" : "text-ink-500")}>
                {t.subject}
                {t.message_count > 1 && <span className="ml-1 text-ink-500">({t.message_count})</span>}
              </p>
              {t.preview && <p className="truncate text-xs text-ink-500">{t.preview}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
              {t.has_attachment && <Paperclip size={14} className="text-ink-300" />}
              {t.is_starred && <Star size={14} className="fill-accent-amber text-accent-amber" />}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
