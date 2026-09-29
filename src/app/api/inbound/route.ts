import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHmac, timingSafeEqual } from "crypto";
import { storeInboundMessage } from "@/lib/inbound/store-message";

export const runtime = "nodejs";

interface InboundPayload {
  to: string;          // full recipient address, e.g. admin1@darasa.site
  from: string;
  subject: string;
  text?: string;
  html?: string;
  messageIdHeader?: string;
  inReplyTo?: string;
  attachments?: { fileName: string; contentType: string; sizeBytes: number; contentBase64: string }[];
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", process.env.INBOUND_WEBHOOK_SECRET!).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-vertex-signature");

  // Only the Cloudflare Worker (which knows INBOUND_WEBHOOK_SECRET) can
  // write inbound mail this way. This is the substitute for a user
  // session here, since inbound mail has no signed-in caller. The
  // Resend path (src/app/api/inbound/resend/[domainId]) authenticates
  // differently, per-domain, since it has no single shared secret.
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as InboundPayload;
  const db = createAdminClient();

  const result = await storeInboundMessage(db, payload);
  return NextResponse.json(result.body, { status: result.status });
}
