import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Called by the Android app (see NativePushRegister) to register or remove
// this device's FCM token for the signed-in mailbox. Uses the caller's own
// session, so RLS (push_subscriptions_owner) guarantees a user can only
// touch their own mailbox's devices.

async function getMailboxId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, mailboxId: null, unauthorized: true };
  const { data: mailbox } = await supabase.from("mailboxes").select("id").eq("auth_user_id", user.id).single();
  return { supabase, mailboxId: mailbox?.id ?? null, unauthorized: false };
}

function validToken(t: unknown): t is string {
  return typeof t === "string" && t.length >= 20 && t.length <= 4096;
}

export async function POST(req: NextRequest) {
  const { supabase, mailboxId, unauthorized } = await getMailboxId();
  if (unauthorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!mailboxId) return NextResponse.json({ error: "no_mailbox" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!validToken(body?.token)) return NextResponse.json({ error: "invalid_token" }, { status: 400 });

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { mailbox_id: mailboxId, endpoint: body.token, p256dh: null, auth: null, platform: "android" },
      { onConflict: "mailbox_id,endpoint" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { supabase, mailboxId, unauthorized } = await getMailboxId();
  if (unauthorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!mailboxId) return NextResponse.json({ ok: true });

  const body = await req.json().catch(() => null);
  if (!validToken(body?.token)) return NextResponse.json({ error: "invalid_token" }, { status: 400 });

  await supabase.from("push_subscriptions").delete().eq("mailbox_id", mailboxId).eq("endpoint", body.token);
  return NextResponse.json({ ok: true });
}
