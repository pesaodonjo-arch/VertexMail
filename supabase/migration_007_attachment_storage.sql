-- Attachment storage (sending + receiving).
-- Run once in the Supabase SQL editor.
--
-- Creates a PRIVATE bucket called "attachments". Nobody can read from it
-- directly; downloads go through /api/mail/attachments/:id, which first checks
-- the signed-in user can see that attachment (RLS), then hands out a
-- short-lived link.
--
-- Outgoing files are uploaded by the browser straight into the signed-in
-- user's own folder (<their user id>/...), which is what lets files bigger
-- than Vercel's ~4.5 MB request limit through.

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)  -- 25 MB per file
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "attachments_upload_own_folder" on storage.objects;
create policy "attachments_upload_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "attachments_delete_own_folder" on storage.objects;
create policy "attachments_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
