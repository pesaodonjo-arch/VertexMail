"use client";

import { useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { ThreadList, type ThreadListItem } from "@/components/mail/ThreadList";
import { FolderHeader } from "@/components/mail/FolderHeader";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ThreadListItem[]>([]);
  const [searched, setSearched] = useState(false);

  async function runSearch(value: string) {
    setQ(value);
    if (!value.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    const res = await fetch(`/api/mail/threads?folder=inbox&q=${encodeURIComponent(value)}`);
    const data = await res.json();
    setResults(data.threads ?? []);
    setSearched(true);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <FolderHeader title="Search" />
      <div className="border-b border-ink-200 bg-white px-4 py-3">
        <div className="relative">
          <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            autoFocus
            className="h-11 w-full rounded-lg border border-ink-200 bg-ink-50 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Search subject and message text…"
            value={q}
            onChange={(e) => runSearch(e.target.value)}
          />
        </div>
      </div>
      {searched ? (
        <ThreadList threads={results} emptyLabel="No messages match that search" />
      ) : (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-ink-400">
          Search only looks through your own mailbox.
        </div>
      )}
    </div>
  );
}
