-- ============================================================================
-- Vertex Mail — schema, indexes, and row-level security
-- Run once against a fresh Supabase project (SQL editor or `supabase db push`)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Platform + domain administration
-- ----------------------------------------------------------------------------

-- Platform owners: full access to every domain/mailbox. Usually 1-3 rows.
create table platform_admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade unique,
  created_at timestamptz not null default now()
);

create table domains (
  id uuid primary key default gen_random_uuid(),
  domain_name text not null unique,                 -- e.g. darasa.site
  status text not null default 'pending'             -- pending | verified | suspended
    check (status in ('pending', 'verified', 'suspended')),
  verification_token text not null default encode(gen_random_bytes(16), 'hex'),
  dkim_public_key text,
  cloudflare_route_id text,                          -- set once the Worker route is created
  max_mailboxes int not null default 10,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

-- Domain admins: scoped to specific domains, can manage mailboxes on them.
create table domain_admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  domain_id uuid not null references domains(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (auth_user_id, domain_id)
);

-- ----------------------------------------------------------------------------
-- 2. Mailboxes — one per email account, 1:1 with an auth.users row
-- ----------------------------------------------------------------------------

create table mailboxes (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references domains(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade unique,
  local_part text not null,                          -- "admin1" in admin1@darasa.site
  display_name text,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted')),
  storage_used_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  suspended_at timestamptz,
  unique (domain_id, local_part)
);

-- Enforce "up to 10 mailboxes per domain" (matches domains.max_mailboxes)
create or replace function enforce_mailbox_quota() returns trigger as $$
declare
  current_count int;
  quota int;
begin
  select count(*) into current_count from mailboxes
    where domain_id = new.domain_id and status <> 'deleted';
  select max_mailboxes into quota from domains where id = new.domain_id;
  if current_count >= quota then
    raise exception 'mailbox_quota_exceeded: domain already has % mailboxes (limit %)', current_count, quota;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_mailbox_quota
  before insert on mailboxes
  for each row execute function enforce_mailbox_quota();

create table mailbox_settings (
  mailbox_id uuid primary key references mailboxes(id) on delete cascade,
  notify_push boolean not null default true,
  notify_email text,                                 -- optional forward-notify address
  signature_html text,
  updated_at timestamptz not null default now()
);

-- Per-domain outgoing-mail provider choice. Deliberately a separate table
-- from `domains` (not columns on it): domains_select's RLS lets a regular
-- mailbox user read their own domain's row so the UI can show "you're on
-- darasa.site" — an api_key column there would leak to every mailbox user
-- on the domain, not just its admins. This table's own policy (below) is
-- admin-only, no mailbox-user read path.
create table domain_email_settings (
  domain_id uuid primary key references domains(id) on delete cascade,
  provider text not null default 'smtp2go' check (provider in ('smtp2go', 'resend', 'mailgun')),
  api_key text,                        -- null = fall back to the platform's default provider (env vars)
  mailgun_domain text,                 -- only used when provider = 'mailgun'
  resend_webhook_secret text,          -- only used when provider = 'resend'; verifies inbound webhook signatures
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Mail data: threads, messages, recipients, attachments
-- ----------------------------------------------------------------------------

create table threads (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references mailboxes(id) on delete cascade,
  subject text not null default '(no subject)',
  folder text not null default 'inbox'
    check (folder in ('inbox', 'sent', 'drafts', 'trash', 'archive', 'spam')),
  is_read boolean not null default false,
  is_starred boolean not null default false,
  last_message_at timestamptz not null default now(),
  message_count int not null default 0,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  mailbox_id uuid not null references mailboxes(id) on delete cascade,  -- denormalized for RLS speed
  direction text not null check (direction in ('inbound', 'outbound')),
  from_address text not null,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  bcc_addresses text[] not null default '{}',
  subject text not null default '(no subject)',
  body_text text,
  body_html text,
  is_draft boolean not null default false,
  provider_message_id text,                           -- id returned by SMTP2GO / inbound source
  in_reply_to text,                                    -- RFC Message-ID threading
  message_id_header text,                               -- our own Message-ID header value
  spam_score numeric,
  created_at timestamptz not null default now()
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  mailbox_id uuid not null references mailboxes(id) on delete cascade,  -- denormalized for RLS speed
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null,
  storage_path text not null,                          -- Supabase Storage object path
  created_at timestamptz not null default now()
);

create index idx_threads_mailbox_folder on threads (mailbox_id, folder, last_message_at desc);
create index idx_messages_thread on messages (thread_id, created_at);
create index idx_messages_mailbox on messages (mailbox_id, created_at desc);
create index idx_attachments_message on attachments (message_id);
create index idx_messages_search on messages using gin (
  to_tsvector('english', coalesce(subject,'') || ' ' || coalesce(body_text,''))
);

-- ----------------------------------------------------------------------------
-- 4. API keys (external send API) + usage log
-- ----------------------------------------------------------------------------

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references domains(id) on delete cascade,
  name text not null,                                  -- human label, e.g. "Darasa signup flow"
  key_prefix text not null,                             -- shown in UI, e.g. vm_live_8f2a
  key_hash text not null,                                -- sha256(key), never store raw key
  created_by uuid references auth.users(id),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

create table api_usage (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid references api_keys(id) on delete set null,
  domain_id uuid not null references domains(id) on delete cascade,
  endpoint text not null,
  status_code int not null,
  message_id uuid references messages(id) on delete set null,
  error_code text,
  created_at timestamptz not null default now()
);

create index idx_api_usage_domain on api_usage (domain_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 5. Push notification subscriptions
-- ----------------------------------------------------------------------------

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references mailboxes(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  platform text not null default 'web' check (platform in ('web', 'ios', 'android')),
  created_at timestamptz not null default now(),
  unique (mailbox_id, endpoint)
);

-- ============================================================================
-- 6. Helper functions used by RLS policies
-- ============================================================================

create or replace function is_platform_admin() returns boolean as $$
  select exists (select 1 from platform_admins where auth_user_id = auth.uid());
$$ language sql stable security definer;

create or replace function is_domain_admin(target_domain_id uuid) returns boolean as $$
  select exists (
    select 1 from domain_admins
    where auth_user_id = auth.uid() and domain_id = target_domain_id
  );
$$ language sql stable security definer;

create or replace function owns_mailbox(target_mailbox_id uuid) returns boolean as $$
  select exists (
    select 1 from mailboxes
    where id = target_mailbox_id and auth_user_id = auth.uid()
  );
$$ language sql stable security definer;

-- ============================================================================
-- 7. Row Level Security
-- ============================================================================

alter table platform_admins enable row level security;
alter table domains enable row level security;
alter table domain_admins enable row level security;
alter table mailboxes enable row level security;
alter table mailbox_settings enable row level security;
alter table domain_email_settings enable row level security;
alter table threads enable row level security;
alter table messages enable row level security;
alter table attachments enable row level security;
alter table api_keys enable row level security;
alter table api_usage enable row level security;
alter table push_subscriptions enable row level security;

-- platform_admins: only platform admins can see the admin list
create policy platform_admins_select on platform_admins
  for select using (is_platform_admin());

-- domains: platform admins see all; domain admins see their own; mailbox
-- users can see (only) the domain their own mailbox belongs to (read-only,
-- needed so the UI can show "you're on darasa.site").
create policy domains_select on domains
  for select using (
    is_platform_admin()
    or is_domain_admin(id)
    or exists (select 1 from mailboxes where domain_id = domains.id and auth_user_id = auth.uid())
  );
create policy domains_write on domains
  for insert with check (is_platform_admin());
create policy domains_update on domains
  for update using (is_platform_admin() or is_domain_admin(id));

-- domain_admins: platform admins manage assignments; a domain admin can see
-- (not modify) their own assignment rows.
create policy domain_admins_select on domain_admins
  for select using (is_platform_admin() or auth_user_id = auth.uid());
create policy domain_admins_write on domain_admins
  for all using (is_platform_admin()) with check (is_platform_admin());

-- mailboxes: platform admins see all; domain admins see mailboxes on their
-- domain(s); a mailbox user can see only their own row. No policy grants
-- cross-mailbox visibility to a regular user under any circumstance.
create policy mailboxes_select on mailboxes
  for select using (
    is_platform_admin()
    or is_domain_admin(domain_id)
    or auth_user_id = auth.uid()
  );
create policy mailboxes_insert on mailboxes
  for insert with check (is_platform_admin() or is_domain_admin(domain_id));
create policy mailboxes_update on mailboxes
  for update using (
    is_platform_admin()
    or is_domain_admin(domain_id)
    or auth_user_id = auth.uid()   -- a user may update their own settings-adjacent fields (e.g. display_name)
  );
create policy mailboxes_delete on mailboxes
  for delete using (is_platform_admin() or is_domain_admin(domain_id));

create policy mailbox_settings_owner on mailbox_settings
  for all using (owns_mailbox(mailbox_id) or is_platform_admin()
    or is_domain_admin((select domain_id from mailboxes where id = mailbox_settings.mailbox_id)))
  with check (owns_mailbox(mailbox_id) or is_platform_admin());

-- Admin-only, full stop — no mailbox-user read path like domains has.
create policy domain_email_settings_admin on domain_email_settings
  for all using (is_platform_admin() or is_domain_admin(domain_id))
  with check (is_platform_admin() or is_domain_admin(domain_id));

-- threads / messages / attachments: the hard isolation boundary.
-- A mailbox user can only ever touch rows whose mailbox_id is their own
-- mailbox. Domain admins get read access for support/abuse investigation
-- (not write) scoped to their assigned domain. Platform admins get full access.
create policy threads_isolation on threads
  for all using (
    owns_mailbox(mailbox_id)
    or is_platform_admin()
    or is_domain_admin((select domain_id from mailboxes where id = threads.mailbox_id))
  )
  with check (owns_mailbox(mailbox_id) or is_platform_admin());

create policy messages_isolation on messages
  for all using (
    owns_mailbox(mailbox_id)
    or is_platform_admin()
    or is_domain_admin((select domain_id from mailboxes where id = messages.mailbox_id))
  )
  with check (owns_mailbox(mailbox_id) or is_platform_admin());

create policy attachments_isolation on attachments
  for all using (
    owns_mailbox(mailbox_id)
    or is_platform_admin()
    or is_domain_admin((select domain_id from mailboxes where id = attachments.mailbox_id))
  )
  with check (owns_mailbox(mailbox_id) or is_platform_admin());

-- api_keys / api_usage: domain-scoped admins only. A mailbox user has no
-- access — API keys are an application/integration concern, not a mailbox one.
create policy api_keys_select on api_keys
  for select using (is_platform_admin() or is_domain_admin(domain_id));
create policy api_keys_write on api_keys
  for all using (is_platform_admin() or is_domain_admin(domain_id))
  with check (is_platform_admin() or is_domain_admin(domain_id));

create policy api_usage_select on api_usage
  for select using (is_platform_admin() or is_domain_admin(domain_id));

-- push_subscriptions: a mailbox manages only its own device registrations.
create policy push_subscriptions_owner on push_subscriptions
  for all using (owns_mailbox(mailbox_id) or is_platform_admin())
  with check (owns_mailbox(mailbox_id));

-- ============================================================================
-- 8. Convenience view: "who am I" resolved once for the client
-- ============================================================================

create or replace view my_context as
select
  auth.uid() as auth_user_id,
  (select id from mailboxes where auth_user_id = auth.uid()) as mailbox_id,
  (select domain_id from mailboxes where auth_user_id = auth.uid()) as mailbox_domain_id,
  is_platform_admin() as is_platform_admin,
  (select coalesce(array_agg(domain_id), '{}') from domain_admins where auth_user_id = auth.uid()) as admin_domain_ids;

-- ============================================================================
-- 9. Keep thread metadata in sync when a message is inserted
-- ============================================================================

create or replace function touch_thread_on_message() returns trigger as $$
begin
  update threads set
    last_message_at = new.created_at,
    message_count = message_count + 1,
    is_read = case when new.direction = 'outbound' then is_read else false end
  where id = new.thread_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_touch_thread
  after insert on messages
  for each row execute function touch_thread_on_message();
