-- Adds "spam" as a thread folder. Safe to run more than once.
do $$
declare c record;
begin
  -- Drop whichever check constraint currently limits threads.folder
  -- (its auto-generated name can differ between databases).
  for c in
    select conname from pg_constraint
    where conrelid = 'public.threads'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%folder%'
  loop
    execute format('alter table public.threads drop constraint %I', c.conname);
  end loop;

  alter table public.threads
    add constraint threads_folder_check
    check (folder in ('inbox', 'sent', 'drafts', 'trash', 'archive', 'spam'));
end $$;
