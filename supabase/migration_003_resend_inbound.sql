-- ============================================================================
-- Vertex Mail — Resend inbound webhook secret
-- Run once. Adds the column domain_email_settings needs to verify
-- Resend's inbound webhook (Svix-signed) for receiving mail.
-- ============================================================================

alter table domain_email_settings
  add column if not exists resend_webhook_secret text;
