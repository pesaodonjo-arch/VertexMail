"use client";

import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { unregisterNativePush } from "@/lib/native-push";
import {
  activateFirstWorking,
  clearAccounts,
  readAccounts,
  removeAccountFrom,
  setLabel,
  upsertAccount,
  type SavedAccount,
} from "@/lib/accounts-store";

// Client-side "accounts on this device" (Gmail-style switcher). Each account is
// its own login; we remember every signed-in account's session on this browser
// so you can switch without typing a password. See accounts-store.ts.
//
// Security note: the saved sessions live in localStorage, so anyone who can
// use this browser profile (or run script on this site) can use them. Same
// trade-off as any "stay signed in" — don't add accounts on a shared computer,
// and use "Sign out of all accounts" when you're done on one.

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function listAccounts(): SavedAccount[] {
  const s = storage();
  return s ? readAccounts(s) : [];
}

/** Remember (or refresh) the signed-in session for this account. */
export function saveSession(session: Session, label?: string): void {
  const s = storage();
  if (!s || !session.user) return;
  upsertAccount(s, {
    userId: session.user.id,
    email: session.user.email ?? "",
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    label,
  });
}

export function setAccountLabel(userId: string, label: string): void {
  const s = storage();
  if (s) setLabel(s, userId, label);
}

/** Forget an account on this device (does not revoke it on the server). */
export function removeAccount(userId: string): void {
  const s = storage();
  if (s) removeAccountFrom(s, userId);
}

async function saveCurrentSession(): Promise<string | null> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) return null;
  saveSession(session);
  return session.user.id;
}

/** Make `account` the active session. Returns false if its sign-in no longer works. */
async function activate(account: SavedAccount): Promise<boolean> {
  const { data, error } = await createClient().auth.setSession({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  });
  if (error || !data.session || data.session.user.id !== account.userId) return false;
  saveSession(data.session); // tokens may have been rotated during activation
  return true;
}

export type SwitchResult = { ok: true } | { ok: false; reason: "expired" | "unknown" };

/**
 * Switch the app to another saved account. On success this does a full page
 * load so every server-rendered screen reads the new session.
 */
export async function switchToAccount(userId: string): Promise<SwitchResult> {
  const previousId = await saveCurrentSession(); // capture latest tokens for the account we're leaving
  const accounts = listAccounts();
  const target = accounts.find((a) => a.userId === userId);
  if (!target) return { ok: false, reason: "unknown" };

  if (await activate(target)) {
    window.location.assign("/inbox"); // /inbox sends admin-only accounts on to /admin
    return { ok: true };
  }

  // A failed switch can clear the session we were on. Put it back, and drop the
  // account that no longer works so it stops appearing in the list.
  removeAccount(userId);
  const previous = previousId ? accounts.find((a) => a.userId === previousId) : undefined;
  if (previous) await activate(previous);
  return { ok: false, reason: "expired" };
}

/** Keep the current account signed in, and open the sign-in page to add another. */
export async function beginAddAccount(): Promise<void> {
  await saveCurrentSession();
  window.location.assign("/login?add=1");
}

/** Sign out of the current account only; fall back to another saved one if any. */
export async function signOutCurrentAccount(): Promise<void> {
  await unregisterNativePush(); // stop notifications for this account on this phone
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) removeAccount(session.user.id);
  await supabase.auth.signOut();

  const s = storage();
  const remaining = s ? readAccounts(s) : [];
  const next = await activateFirstWorking(remaining, activate, (a) => removeAccount(a.userId));
  window.location.assign(next ? "/inbox" : "/login");
}

/** Sign out everywhere on this device and forget every saved account. */
export async function signOutAllAccounts(): Promise<void> {
  await unregisterNativePush();
  const s = storage();
  if (s) clearAccounts(s);
  await createClient().auth.signOut();
  window.location.assign("/login");
}
