-- Live new-mail notifications: lets the app hear about new messages and
-- read-state changes over Supabase Realtime. Row-level security still applies,
-- so each person is only ever sent events for their own mailbox.
-- Safe to run more than once.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'threads'
  ) then
    alter publication supabase_realtime add table public.threads;
  end if;
end $$;
