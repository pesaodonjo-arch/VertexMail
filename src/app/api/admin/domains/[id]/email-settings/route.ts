import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET/PUT /api/admin/domains/:id/email-settings
 *
 * Uses the SESSION client throughout, not the admin client — RLS on
 * domain_email_settings (platform admin OR that domain's admin) is
 * exactly the access rule this route needs, so there's no reason to
 * bypass it here.
 *
 * GET never returns the raw api_key — only whether one is set
 * (`api_key_set: boolean`) — so a previously saved key is never
 * re-displayed in the browser after the fact. PUT accepts a new key to
 * replace it, or `api_key: null` to clear it (falls back to the
 * platform default provider for that domain).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("domain_email_settings")
    .select("provider, api_key, mailgun_domain, resend_webhook_secret, updated_at")
    .eq("domain_id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  return NextResponse.json({
    provider: data?.provider ?? "smtp2go",
    api_key_set: !!data?.api_key,
    mailgun_domain: data?.mailgun_domain ?? null,
    resend_webhook_secret_set: !!data?.resend_webhook_secret,
    updated_at: data?.updated_at ?? null,
    // No setting saved yet means "using the platform default" — distinct
    // from having explicitly chosen smtp2go with no key of your own.
    using_platform_default: !data,
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const body = await req.json();

  const provider = body.provider as string | undefined;
  const apiKey = body.api_key as string | null | undefined; // undefined = leave unchanged, null = clear
  const mailgunDomain = body.mailgun_domain as string | null | undefined;
  const resendWebhookSecret = body.resend_webhook_secret as string | null | undefined; // undefined = leave unchanged

  if (provider && !["smtp2go", "resend", "mailgun"].includes(provider)) {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }
  if (provider === "mailgun" && apiKey && !mailgunDomain) {
    return NextResponse.json(
      { error: "mailgun_domain_required", message: "mailgun_domain is required when provider is mailgun." },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from("domain_email_settings")
    .select("provider, api_key, mailgun_domain, resend_webhook_secret")
    .eq("domain_id", params.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("domain_email_settings")
    .upsert({
      domain_id: params.id,
      provider: provider ?? existing?.provider ?? "smtp2go",
      api_key: apiKey === undefined ? existing?.api_key ?? null : apiKey,
      mailgun_domain: mailgunDomain === undefined ? existing?.mailgun_domain ?? null : mailgunDomain,
      resend_webhook_secret:
        resendWebhookSecret === undefined ? existing?.resend_webhook_secret ?? null : resendWebhookSecret,
      updated_at: new Date().toISOString(),
    })
    .select("provider, api_key, mailgun_domain, resend_webhook_secret")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  return NextResponse.json({
    provider: data.provider,
    api_key_set: !!data.api_key,
    mailgun_domain: data.mailgun_domain,
    resend_webhook_secret_set: !!data.resend_webhook_secret,
  });
}
