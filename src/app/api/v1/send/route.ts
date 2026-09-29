import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashApiKey, looksLikeVertexApiKey } from "@/lib/api-keys";
import { getEmailProvider } from "@/lib/email-provider";
import { resolveDomainProvider } from "@/lib/email-provider/resolve-for-domain";

export const runtime = "nodejs";

interface SendBody {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
}

// Simple in-memory sliding-window limiter per key. Swap for a Redis/KV
// backed limiter (e.g. Upstash) before relying on this across multiple
// server instances.
const RATE_LIMIT = { windowMs: 60_000, max: 60 };
const hits = new Map<string, number[]>();
function isRateLimited(keyId: string): boolean {
  const now = Date.now();
  const arr = (hits.get(keyId) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  arr.push(now);
  hits.set(keyId, arr);
  return arr.length > RATE_LIMIT.max;
}

async function logUsage(
  db: ReturnType<typeof createAdminClient>,
  fields: { api_key_id: string | null; domain_id: string; status_code: number; message_id?: string; error_code?: string }
) {
  await db.from("api_usage").insert({ endpoint: "/api/v1/send", ...fields });
}

export async function POST(req: NextRequest) {
  const db = createAdminClient();
  const authHeader = req.headers.get("authorization") ?? "";
  const rawKey = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!rawKey || !looksLikeVertexApiKey(rawKey)) {
    return NextResponse.json({ error: "unauthorized", message: "Missing or malformed API key." }, { status: 401 });
  }

  // 1. Resolve the key -> domain. This is the whole trust boundary: a key
  //    is permanently bound to exactly one domain at creation time.
  const { data: apiKey } = await db
    .from("api_keys")
    .select("id, domain_id, status")
    .eq("key_hash", hashApiKey(rawKey))
    .maybeSingle();

  if (!apiKey || apiKey.status !== "active") {
    return NextResponse.json({ error: "unauthorized", message: "Invalid or revoked API key." }, { status: 401 });
  }

  if (isRateLimited(apiKey.id)) {
    await logUsage(db, { api_key_id: apiKey.id, domain_id: apiKey.domain_id, status_code: 429, error_code: "rate_limited" });
    return NextResponse.json({ error: "rate_limited", message: "Too many requests." }, { status: 429 });
  }

  const { data: domain } = await db
    .from("domains")
    .select("id, domain_name, status")
    .eq("id", apiKey.domain_id)
    .single();

  if (!domain || domain.status !== "verified") {
    await logUsage(db, { api_key_id: apiKey.id, domain_id: apiKey.domain_id, status_code: 403, error_code: "domain_not_verified" });
    return NextResponse.json({ error: "domain_not_verified", message: "This domain is not verified for sending." }, { status: 403 });
  }

  let body: SendBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.from || !Array.isArray(body.to) || body.to.length === 0 || !body.subject) {
    return NextResponse.json(
      { error: "invalid_request", message: "from, to[], and subject are required." },
      { status: 400 }
    );
  }

  // 2. THE key enforcement: the "from" address's domain must exactly
  //    match the domain this API key is scoped to. This is what stops
  //    tenant A's key from ever sending as tenant B's domain, even if
  //    tenant A guesses or brute-forces an address on domain B.
  const fromDomain = body.from.split("@")[1]?.toLowerCase();
  if (fromDomain !== domain.domain_name.toLowerCase()) {
    await logUsage(db, {
      api_key_id: apiKey.id, domain_id: apiKey.domain_id, status_code: 403, error_code: "domain_mismatch",
    });
    return NextResponse.json(
      { error: "domain_mismatch", message: `This API key may only send from @${domain.domain_name}.` },
      { status: 403 }
    );
  }

  // 3. The "from" address must be a real, active mailbox on the domain —
  //    an API key can't send as an address that doesn't exist either.
  const localPart = body.from.split("@")[0];
  const { data: mailbox } = await db
    .from("mailboxes")
    .select("id, status")
    .eq("domain_id", domain.id)
    .eq("local_part", localPart)
    .maybeSingle();

  if (!mailbox || mailbox.status !== "active") {
    await logUsage(db, { api_key_id: apiKey.id, domain_id: apiKey.domain_id, status_code: 404, error_code: "unknown_sender" });
    return NextResponse.json({ error: "unknown_sender", message: "from address is not an active mailbox on this domain." }, { status: 404 });
  }

  // 4. Send via the abstracted provider, then persist a copy into the
  //    sender's own Sent folder so it shows up in the web/mobile client
  //    just like a message composed in the UI.
  try {
    const override = await resolveDomainProvider(db, domain.id);
    const provider = getEmailProvider(override);
    const result = await provider.send({
      from: body.from,
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      text: body.text,
      html: body.html,
    });

    const { data: thread } = await db
      .from("threads")
      .insert({ mailbox_id: mailbox.id, subject: body.subject, folder: "sent", is_read: true })
      .select("id")
      .single();

    const { data: message } = await db
      .from("messages")
      .insert({
        thread_id: thread!.id,
        mailbox_id: mailbox.id,
        direction: "outbound",
        from_address: body.from,
        to_addresses: body.to,
        cc_addresses: body.cc ?? [],
        bcc_addresses: body.bcc ?? [],
        subject: body.subject,
        body_text: body.text ?? null,
        body_html: body.html ?? null,
        provider_message_id: result.providerMessageId,
      })
      .select("id")
      .single();

    await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKey.id);
    await logUsage(db, {
      api_key_id: apiKey.id, domain_id: domain.id, status_code: 200, message_id: message?.id,
    });

    return NextResponse.json({ id: message?.id, provider_message_id: result.providerMessageId, status: "sent" });
  } catch (err) {
    await logUsage(db, { api_key_id: apiKey.id, domain_id: domain.id, status_code: 502, error_code: "provider_error" });
    return NextResponse.json({ error: "provider_error", message: (err as Error).message }, { status: 502 });
  }
}
