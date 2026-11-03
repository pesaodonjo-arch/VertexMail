-- Native Android push (FCM).
-- Web Push rows need p256dh + auth; native FCM rows only have a device token
-- (stored in `endpoint`), so those two columns must be allowed to be empty.
-- Run once in the Supabase SQL editor.
alter table push_subscriptions alter column p256dh drop not null;
alter table push_subscriptions alter column auth drop not null;

create index if not exists push_subscriptions_mailbox_platform_idx
  on push_subscriptions (mailbox_id, platform);
