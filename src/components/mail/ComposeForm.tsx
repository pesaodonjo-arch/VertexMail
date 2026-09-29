"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Paperclip, Send } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export interface ComposeFormProps {
  mode: "new" | "reply" | "forward";
  initialTo: string;
  initialSubject: string;
  initialBody: string;
  /** Only set for replies — keeps the sent message inside the same conversation. */
  replyToThreadId?: string;
}

export function ComposeForm({ mode, initialTo, initialSubject, initialBody, replyToThreadId }: ComposeFormProps) {
  const router = useRouter();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For replies the recipient and subject are already filled in, so put the
  // cursor at the very top of the message body, above the quoted text.
  useEffect(() => {
    if (mode === "reply" && bodyRef.current) {
      bodyRef.current.focus();
      bodyRef.current.setSelectionRange(0, 0);
      bodyRef.current.scrollTop = 0;
    }
  }, [mode]);

  async function send(saveAsDraft = false) {
    setSending(true);
    setError(null);
    const res = await fetch("/api/mail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: to.split(",").map((s) => s.trim()).filter(Boolean),
        subject,
        text: body,
        inReplyToThreadId: replyToThreadId,
        saveAsDraft,
      }),
    });
    setSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? "Couldn't send that message. Try again.");
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (saveAsDraft) router.push("/drafts");
    else if (replyToThreadId) router.push(`/thread/${replyToThreadId}`); // back to the conversation
    else router.push("/sent");
    router.refresh();
    void data;
  }

  const title = mode === "reply" ? "Reply" : mode === "forward" ? "Forward" : "New message";

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-ink-200 bg-white/95 px-3 py-3 backdrop-blur vx-safe-top">
        <Link
          href={replyToThreadId ? `/thread/${replyToThreadId}` : "/inbox"}
          className="rounded-lg p-1.5 hover:bg-ink-100 md:hidden"
        >
          <ArrowLeft size={19} />
        </Link>
        <h1 className="font-display text-base font-bold text-ink-900">{title}</h1>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => send(true)} disabled={sending}>Save draft</Button>
          <Button size="sm" onClick={() => send(false)} disabled={sending || !to || !subject}>
            <Send size={15} /> {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </header>

      <div className="vx-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {error && <p className="rounded-lg bg-accent-rose/10 px-3 py-2 text-sm text-accent-rose">{error}</p>}

        <Input placeholder="To" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea
          ref={bodyRef}
          className="min-h-[40vh] w-full resize-none rounded-lg border border-ink-200 bg-white p-3 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Write your message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-dashed border-ink-300 px-3 py-2.5 text-sm text-ink-500 hover:border-brand-400 hover:text-brand-600"
        >
          <Paperclip size={15} /> Attach files
        </button>
      </div>
    </div>
  );
}
