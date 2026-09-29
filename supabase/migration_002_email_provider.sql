-- ============================================================================
-- Vertex Mail — per-domain email provider settings
-- Run this once against an existing project (new projects get this via the
-- updated schema.sql instead — this file exists for databases that already
-- ran the original schema.sql before this feature existed).
-- ============================================================================

-- Deliberately a SEPARATE table from `domains`, not new columns on it.
-- domains_select's RLS lets a regular mailbox user read their own domain's
-- row (so the UI can show "you're on darasa.site") — an API key column on
-- that same table would be exposed to every mailbox user on the domain,
-- not just its admins. This table has its own, stricter policy below.
create table domain_email_settings (
  domain_id uuid primary key references domains(id) on delete cascade,
  provider text not null default 'smtp2go' check (provider in ('smtp2go', 'resend', 'mailgun')),
  api_key text,                        -- null = fall back to the platform's default provider (env vars)
  mailgun_domain text,                 -- only used when provider = 'mailgun'
  updated_at timestamptz not null default now()
);

alter table domain_email_settings enable row level security;

-- Admin-only, full stop — no mailbox-user read path like domains has.
create policy domain_email_settings_admin on domain_email_settings
  for all using (is_platform_admin() or is_domain_admin(domain_id))
  with check (is_platform_admin() or is_domain_admin(domain_id));
