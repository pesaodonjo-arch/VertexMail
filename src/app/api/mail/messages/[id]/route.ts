import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/mail/messages/:id — RLS (messages_isolation) means this query
// simply returns nothing if the message doesn't belong to the caller's
// mailbox; there's no separate "is this mine?" check to forget to write.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: message, error } = await supabase
    .from("messages")
    .select("*, attachments(id, file_name, content_type, size_bytes)")
    .eq("id", params.id)
    .single();

  if (error || !message) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await supabase.from("threads").update({ is_read: true }).eq("id", message.thread_id);

  return NextResponse.json({ message });
}
