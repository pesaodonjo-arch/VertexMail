import { createClient } from "@/lib/supabase/server";
import type { ThreadListItem } from "@/components/mail/ThreadList";

/**
 * Fetches threads for a folder, enriched with a one-line preview of the
 * latest message in each thread. Two queries (threads, then their latest
 * messages) rather than a single joined one, kept simple for readability;
 * for high-volume mailboxes replace with a `thread_previews` materialized
 * view. RLS scopes both queries to the caller's own mailbox regardless.
 *
 * "sent" is special: a reply lives inside the conversation it answers (which
 * may be filed under Inbox), so Sent is every conversation I've actually sent
 * something in — not just threads whose folder column says "sent". For Sent
 * the preview, recipient and time come from my latest sent message.
 */
export async function getThreadsForFolder(folder: string): Promise<ThreadListItem[]> {
  const supabase = createClient();
  const isSent = folder === "sent";

  let threadIds: string[] | null = null;
  if (isSent) {
    const { data: sentMessages } = await supabase
      .from("messages")
      .select("thread_id")
      .eq("direction", "outbound")
      .eq("is_draft", false)
      .order("created_at", { ascending: false })
      .limit(200);
    threadIds = [...new Set((sentMessages ?? []).map((m) => m.thread_id))];
    if (threadIds.length === 0) return [];
  }

  let threadQuery = supabase
    .from("threads")
    .select("id, subject, is_read, is_starred, last_message_at, message_count")
    .order("last_message_at", { ascending: false })
    .limit(50);

  threadQuery = isSent
    ? threadQuery.in("id", threadIds!).not("folder", "in", "(trash,spam)")
    : threadQuery.eq("folder", folder);

  const { data: threads } = await threadQuery;
  if (!threads || threads.length === 0) return [];

  let messagesQuery = supabase
    .from("messages")
    .select("thread_id, from_address, to_addresses, body_text, direction, created_at")
    .in("thread_id", threads.map((t) => t.id))
    .order("created_at", { ascending: false });
  if (isSent) messagesQuery = messagesQuery.eq("direction", "outbound").eq("is_draft", false);

  const { data: messagesData } = await messagesQuery;

  const messages = messagesData ?? [];
  const latestByThread = new Map<string, (typeof messages)[number]>();
  for (const m of messages) {
    if (!latestByThread.has(m.thread_id)) latestByThread.set(m.thread_id, m);
  }

  const items = threads.map((t) => {
    const latest = latestByThread.get(t.id);
    const counterparty = latest
      ? latest.direction === "inbound"
        ? latest.from_address
        : latest.to_addresses?.[0] ?? "—"
      : undefined;
    return {
      id: t.id,
      subject: t.subject,
      preview: latest?.body_text?.slice(0, 90),
      counterparty,
      is_read: isSent ? true : t.is_read, // nothing is "unread" in what I sent
      is_starred: t.is_starred,
      last_message_at: isSent && latest ? latest.created_at : t.last_message_at,
      message_count: t.message_count,
    };
  });

  return isSent
    ? items.sort((a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at))
    : items;
}
