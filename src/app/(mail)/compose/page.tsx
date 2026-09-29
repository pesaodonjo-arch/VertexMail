import { createClient } from "@/lib/supabase/server";
import { ComposeForm } from "@/components/mail/ComposeForm";
import { buildForwardBody, buildReplyBody, forwardSubject, replySubject, extractEmail } from "@/lib/reply";

export const dynamic = "force-dynamic";

/**
 * /compose                      -> blank new message
 * /compose?replyTo=<threadId>   -> To + "Re: subject" + quoted original filled in
 * /compose?forwardFrom=<id>     -> "Fwd: subject" + forwarded original, To left blank
 *
 * The thread is loaded with the caller's own session, so RLS means a thread id
 * that isn't theirs simply loads nothing and they get a blank form.
 */
export default async function ComposePage({
  searchParams,
}: {
  searchParams: { replyTo?: string; forwardFrom?: string };
}) {
  const threadId = searchParams.replyTo ?? searchParams.forwardFrom;
  const mode = searchParams.replyTo ? "reply" : searchParams.forwardFrom ? "forward" : "new";

  let initialTo = "";
  let initialSubject = "";
  let initialBody = "";
  let validThreadId: string | undefined;

  if (threadId) {
    const supabase = createClient();
    const { data: thread } = await supabase.from("threads").select("id, subject").eq("id", threadId).maybeSingle();

    if (thread) {
      const { data: messages } = await supabase
        .from("messages")
        .select("from_address, to_addresses, subject, body_text, body_html, direction, created_at")
        .eq("thread_id", thread.id)
        .eq("is_draft", false)
        .order("created_at", { ascending: false })
        .limit(1);

      const latest = messages?.[0];
      if (latest) {
        if (mode === "reply") {
          // Reply to whoever wrote last. If the last message was one I sent,
          // "reply" means following up with the same people.
          initialTo =
            latest.direction === "inbound"
              ? extractEmail(latest.from_address)
              : (latest.to_addresses ?? []).join(", ");
          initialSubject = replySubject(thread.subject);
          initialBody = buildReplyBody(latest);
          validThreadId = thread.id;
        } else {
          initialSubject = forwardSubject(thread.subject);
          initialBody = buildForwardBody(latest);
        }
      }
    }
  }

  return (
    <ComposeForm
      mode={validThreadId || mode === "forward" ? mode : "new"}
      initialTo={initialTo}
      initialSubject={initialSubject}
      initialBody={initialBody}
      replyToThreadId={validThreadId}
    />
  );
}
