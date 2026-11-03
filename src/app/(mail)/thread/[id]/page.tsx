import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Paperclip, Reply, Forward } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import { ThreadActions } from "@/components/mail/ThreadActions";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  // RLS (threads_isolation / messages_isolation) means these two queries
  // simply come back empty if this thread belongs to another mailbox —
  // there is no other check standing between this page and that guarantee.
  const { data: thread } = await supabase.from("threads").select("*").eq("id", params.id).single();
  if (!thread) notFound();

  // Opening a conversation marks it read (RLS limits this to the owner's thread).
  if (!thread.is_read) {
    await supabase.from("threads").update({ is_read: true }).eq("id", params.id);
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("*, attachments(id, file_name, size_bytes, content_type, storage_path)")
    .eq("thread_id", params.id)
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-ink-200 bg-white/95 px-3 py-3 backdrop-blur vx-safe-top">
        <Link href="/inbox" className="rounded-lg p-1.5 hover:bg-ink-100 md:hidden">
          <ArrowLeft size={19} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-base font-bold text-ink-900">{thread.subject}</h1>
        <ThreadActions threadId={thread.id} folder={thread.folder} />
      </header>

      {thread.folder === "spam" && (
        <p className="border-b border-accent-amber/30 bg-accent-amber/10 px-4 py-2 text-xs text-ink-700">
          This conversation is in Spam. Use “Not spam” to move it back to your inbox.
        </p>
      )}

      <div className="vx-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {(messages ?? []).map((m) => (
          <article
            key={m.id}
            className={
              m.direction === "outbound"
                ? "ml-6 rounded-xl border border-brand-100 bg-brand-50/50 p-4 shadow-panel md:ml-16"
                : "mr-6 rounded-xl border border-ink-200 bg-white p-4 shadow-panel md:mr-16"
            }
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">
                  {m.direction === "outbound" ? "You" : m.from_address}
                  {m.is_draft && <span className="ml-2 text-xs font-normal text-ink-500">(draft)</span>}
                </p>
                <p className="truncate text-xs text-ink-500">to {m.to_addresses?.join(", ")}</p>
              </div>
              <time className="shrink-0 text-xs text-ink-500">{format(new Date(m.created_at), "MMM d, h:mm a")}</time>
            </div>

            {m.body_html ? (
              <div className="vx-keep prose prose-sm max-w-none text-ink-900 dark:rounded-lg dark:bg-white dark:p-3 [--tw-prose-body:theme(colors.ink.900)] [--tw-prose-headings:theme(colors.ink.900)] [--tw-prose-bold:theme(colors.ink.900)] [--tw-prose-lead:theme(colors.ink.800)] [--tw-prose-counters:theme(colors.ink.700)] [--tw-prose-bullets:theme(colors.ink.700)] [--tw-prose-quotes:theme(colors.ink.800)] [--tw-prose-quote-borders:theme(colors.ink.300)] [--tw-prose-links:theme(colors.brand.700)]" dangerouslySetInnerHTML={{ __html: m.body_html }} />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-900">{m.body_text}</p>
            )}

            {(m.attachments ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
                {(m.attachments ?? []).map((a: any) => {
                  const size = a.size_bytes >= 1024 * 1024 ? `${(a.size_bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(a.size_bytes / 1024))} KB`;
                  const chip = "inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs text-ink-600";
                  return a.storage_path ? (
                    <a
                      key={a.id}
                      href={`/api/mail/attachments/${a.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${chip} hover:border-brand-400 hover:text-brand-700`}
                    >
                      <Paperclip size={12} /> {a.file_name}
                      <span className="text-ink-500">· {size}</span>
                    </a>
                  ) : (
                    <span key={a.id} className={chip}>
                      <Paperclip size={12} /> {a.file_name}
                      <span className="text-ink-500">· {size}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="flex gap-2 border-t border-ink-200 bg-white px-4 py-3 vx-safe-bottom">
        <Link href={`/compose?replyTo=${thread.id}`} className="flex-1">
          <Button variant="secondary" className="w-full"><Reply size={16} /> Reply</Button>
        </Link>
        <Link href={`/compose?forwardFrom=${thread.id}`} className="flex-1">
          <Button variant="secondary" className="w-full"><Forward size={16} /> Forward</Button>
        </Link>
      </div>
    </div>
  );
}
