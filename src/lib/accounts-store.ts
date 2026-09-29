// Pure storage logic for the "accounts on this device" list (no Supabase, no
// window access — storage is passed in), so it can be tested on its own.
//
// Model: like Gmail's account switcher, each account is a SEPARATE login.
// We keep every signed-in account's session tokens on this device so switching
// is instant and needs no password. Nothing here grants access to anything the
// person couldn't already reach by signing in to that account.

export interface SavedAccount {
  userId: string;
  email: string;        // the login email (Supabase auth user)
  label: string;        // what to show: the mailbox address when known, else the login email
  accessToken: string;
  refreshToken: string;
  lastUsedAt: number;
}

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const ACCOUNTS_KEY = "vertex.accounts.v1";

export function readAccounts(storage: StorageLike): SavedAccount[] {
  try {
    const raw = storage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a) =>
          a && typeof a.userId === "string" && typeof a.refreshToken === "string" &&
          typeof a.accessToken === "string" && typeof a.email === "string"
      )
      .map((a) => ({ ...a, label: typeof a.label === "string" && a.label ? a.label : a.email, lastUsedAt: Number(a.lastUsedAt) || 0 }))
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  } catch {
    return [];
  }
}

function write(storage: StorageLike, list: SavedAccount[]) {
  try {
    storage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked — switching just won't remember accounts */
  }
}

/** Add or refresh an account. Keeps a previously known label unless a new one is given. */
export function upsertAccount(
  storage: StorageLike,
  input: { userId: string; email: string; accessToken: string; refreshToken: string; label?: string },
  now = Date.now()
): SavedAccount[] {
  const list = readAccounts(storage);
  const existing = list.find((a) => a.userId === input.userId);
  const next: SavedAccount = {
    userId: input.userId,
    email: input.email,
    label: input.label || existing?.label || input.email,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    lastUsedAt: now,
  };
  const out = [next, ...list.filter((a) => a.userId !== input.userId)];
  write(storage, out);
  return out;
}

export function setLabel(storage: StorageLike, userId: string, label: string): void {
  const list = readAccounts(storage);
  if (!list.some((a) => a.userId === userId)) return;
  write(storage, list.map((a) => (a.userId === userId ? { ...a, label } : a)));
}

export function removeAccountFrom(storage: StorageLike, userId: string): SavedAccount[] {
  const out = readAccounts(storage).filter((a) => a.userId !== userId);
  write(storage, out);
  return out;
}

export function clearAccounts(storage: StorageLike): void {
  try {
    storage.removeItem(ACCOUNTS_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Try accounts in order until one activates. Any account that fails (its
 * sign-in expired or was revoked) is reported via onFail so the caller can drop
 * it from the list instead of retrying it forever.
 */
export async function activateFirstWorking(
  accounts: SavedAccount[],
  activate: (a: SavedAccount) => Promise<boolean>,
  onFail: (a: SavedAccount) => void
): Promise<SavedAccount | null> {
  for (const a of accounts) {
    if (await activate(a)) return a;
    onFail(a);
  }
  return null;
}
