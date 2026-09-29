// Browser-side helpers for new-mail notifications. Client-only.

const PREF_KEY = "vx:notify";

export type NotifyState = "unsupported" | "denied" | "default" | "on" | "off";

function readPref(): string | null {
  try { return localStorage.getItem(PREF_KEY); } catch { return null; }
}
function writePref(v: "on" | "off") {
  try { localStorage.setItem(PREF_KEY, v); } catch { /* private mode — permission alone still works */ }
}

export function getNotifyState(): NotifyState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "default") return "default";
  return readPref() === "off" ? "off" : "on";
}

export async function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("/sw.js"); } catch { return null; }
}

export async function enableNotifications(): Promise<NotifyState> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission === "granted") {
    writePref("on");
    await registerServiceWorker();
  }
  return getNotifyState();
}

export function disableNotifications(): NotifyState {
  writePref("off");
  return getNotifyState();
}

async function getActiveRegistration() {
  if (!("serviceWorker" in navigator)) return undefined;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return undefined;
  if (reg.active) return reg;
  // Just registered — give it a moment to activate.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<undefined>((r) => setTimeout(() => r(undefined), 3000)),
  ]);
}

/** Shows an OS-level notification. Resolves false if notifications are off or unavailable. */
export async function showSystemNotification(opts: { title: string; body: string; url: string; tag?: string }) {
  if (getNotifyState() !== "on") return false;
  try {
    // Mobile browsers only allow notifications through a service worker.
    const reg = await getActiveRegistration();
    if (reg) {
      await reg.showNotification(opts.title, { body: opts.body, tag: opts.tag, data: { url: opts.url } });
      return true;
    }
    const n = new Notification(opts.title, { body: opts.body, tag: opts.tag });
    n.onclick = () => { window.focus(); window.location.href = opts.url; n.close(); };
    return true;
  } catch {
    return false;
  }
}

/** "Jane Doe <jane@x.com>" -> "Jane Doe"; bare addresses pass through. */
export function senderName(from?: string | null): string {
  if (!from) return "New message";
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return (m?.[1] ?? from).trim() || from;
}
