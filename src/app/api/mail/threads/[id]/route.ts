import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PATCH /api/mail/threads/:id   body: { folder: "inbox" | "archive" | "trash" | "spam" }
//
// Moves a conversation between folders. Ownership is enforced by RLS
// (threads_isolation): for a thread in someone else's mailbox the update
// matches no rows and this returns 404 — there's no separate check to forget.
const MOVABLE = ["inbox", "archive", "trash", "spam"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const folder = body?.folder;
  if (typeof folder !== "string" || !MOVABLE.includes(folder)) {
    return NextResponse.json({ error: "invalid_folder" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("threads")
    .update({ folder })
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, folder });
}
