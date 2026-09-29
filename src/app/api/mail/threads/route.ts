import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/mail/threads?folder=inbox&q=search+terms
//
// Deliberately does NOT accept a mailbox_id param — the mailbox is always
// resolved from the caller's own session (my_context view / RLS), so
// there is no parameter a client could tamper with to read another
// mailbox's threads. RLS (threads_isolation) is the actual backstop even
// if this route had a bug.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const folder = req.nextUrl.searchParams.get("folder") ?? "inbox";
  const q = req.nextUrl.searchParams.get("q");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let query = supabase
    .from("threads")
    .select("id, subject, folder, is_read, is_starred, last_message_at, message_count")
    .eq("folder", folder)
    .order("last_message_at", { ascending: false })
    .limit(50);

  if (q) {
    // Search across subject/body via the messages full-text index, then
    // fold back to threads. RLS still scopes this to the caller's mailbox.
    const { data: matchingMessages } = await supabase
      .from("messages")
      .select("thread_id")
      .textSearch("subject", q, { type: "websearch" })
      .limit(100);
    const threadIds = [...new Set((matchingMessages ?? []).map((m) => m.thread_id))];
    query = supabase
      .from("threads")
      .select("id, subject, folder, is_read, is_starred, last_message_at, message_count")
      .in("id", threadIds)
      .order("last_message_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ threads: data });
}
