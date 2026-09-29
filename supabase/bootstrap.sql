-- Run once after schema.sql, with your own values, to create the first
-- platform owner. Replace the auth_user_id with the id of a user you've
-- created in Supabase Auth (Authentication -> Users -> Add user) using
-- PLATFORM_OWNER_EMAIL from your .env.

insert into platform_admins (auth_user_id)
values ('00000000-0000-0000-0000-000000000000'); -- <- replace with the real auth.users.id
