"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Paperclip, Send, X } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { ATTACHMENT_BUCKET, MAX_ATTACHMENTS, MAX_TOTAL_BYTES, formatSize, isBlockedFileName } from "@/lib/attachments";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  // Files already uploaded to storage, so a retry after a failed send doesn't upload them again.
  const uploadedRef = useRef<Map<File, string>>(new Map());

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

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked: File[] = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow picking the same file again after removing it
    if (picked.length === 0) return;

    const blocked = picked.filter((f) => isBlockedFileName(f.name));
    const allowed = picked.filter((f) => !isBlockedFileName(f.name));
    const next = [...files, ...allowed.filter((f) => !files.some((x) => x.name === f.name && x.size === f.size))];
    const total = next.reduce((n, f) => n + f.size, 0);

    if (next.length > MAX_ATTACHMENTS) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
      return;
    }
    if (total > MAX_TOTAL_BYTES) {
      setError(`Attachments can total at most ${formatSize(MAX_TOTAL_BYTES)} (you picked ${formatSize(total)}).`);
      return;
    }
    setError(
      blocked.length > 0
        ? `${blocked.map((f) => f.name).join(", ")} can't be sent (this file type is blocked for security). Zip it or use another format.`
        : null
    );
    setFiles(next);
  }

  // Upload straight from the browser to Supabase Storage (into this user's own
  // folder). This is what lets attachments be bigger than Vercel's request limit.
  async function uploadAll(): Promise<{ fileName: string; contentType: string; sizeBytes: number; path: string }[]> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Your session expired. Sign in again and retry.");

    const out: { fileName: string; contentType: string; sizeBytes: number; path: string }[] = [];
    for (const f of files) {
      let path = uploadedRef.current.get(f);
      if (!path) {
        path = `${user.id}/${crypto.randomUUID()}`;
        const { error: upErr } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(path, f, { contentType: f.type || "application/octet-stream", upsert: false });
        if (upErr) throw new Error(`Couldn't upload ${f.name}: ${upErr.message}`);
        uploadedRef.current.set(f, path);
      }
      out.push({ fileName: f.name, contentType: f.type || "application/octet-stream", sizeBytes: f.size, path });
    }
    return out;
  }

  async function send(saveAsDraft = false) {
    if (saveAsDraft && files.length > 0) {
      setError("Drafts can't keep attachments yet. Remove them to save a draft, or send the message.");
      return;
    }
    setSending(true);
    setError(null);
    let attachments: { fileName: string; contentType: string; sizeBytes: number; path: string }[] = [];
    try {
      attachments = await uploadAll();
    } catch (e) {
      setSending(false);
      setError((e as Error).message || "Couldn't upload your attachments. Try again.");
      return;
    }
    let res: Response;
    try {
      res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.split(",").map((s) => s.trim()).filter(Boolean),
          subject,
          text: body,
          inReplyToThreadId: replyToThreadId,
          saveAsDraft,
          attachments,
        }),
      });
    } catch {
      setSending(false);
      setError("Couldn't reach the server. Check your connection and try again.");
      return;
    }
    setSending(false);
    if (res.status === 413) {
      setError("Those attachments are too large to send. Remove one and try again.");
      return;
    }
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
            <Send size={15} /> {sending ? (files.length > 0 ? "Uploading…" : "Sending…") : "Send"}
          </Button>
        </div>
      </header>

      <div className="vx-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {error && <p className="rounded-lg bg-accent-rose/10 px-3 py-2 text-sm text-accent-rose">{error}</p>}

        <Input placeholder="To" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea
          ref={bodyRef}
          className="min-h-[40vh] w-full resize-none rounded-lg border border-ink-200 bg-white p-3 text-sm text-ink-900 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Write your message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onPickFiles} />

        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900">
                <FileText size={15} className="shrink-0 text-ink-500" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-ink-500">{formatSize(f.size)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="shrink-0 rounded p-1 text-ink-500 hover:bg-ink-100"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-dashed border-ink-300 px-3 py-2.5 text-sm text-ink-500 hover:border-brand-400 hover:text-brand-600"
        >
          <Paperclip size={15} /> Attach files
        </button>
      </div>
    </div>
  );
}
