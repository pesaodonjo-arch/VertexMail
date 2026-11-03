"use client";

/**
 * Helpers for the Android (Capacitor) app. In a normal browser every function
 * here is a harmless no-op. Inside the app, Capacitor injects `window.Capacitor`
 * into the page, which is how we reach the native push plugin without adding
 * any npm package to the website.
 */

export const FCM_TOKEN_KEY = "vm_fcm_token";

export function getCapacitor(): any | null {
  if (typeof window === "undefined") return null;
  const cap = (window as any).Capacitor;
  return cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform() ? cap : null;
}

export function getPushPlugin(): any | null {
  const cap = getCapacitor();
  if (!cap) return null;
  try {
    return cap.registerPlugin ? cap.registerPlugin("PushNotifications") : cap.Plugins?.PushNotifications ?? null;
  } catch {
    return cap.Plugins?.PushNotifications ?? null;
  }
}

/** Tell the server to stop sending to this device for the CURRENT account. Call before signing out. */
export async function unregisterNativePush(): Promise<void> {
  try {
    const token = window.localStorage.getItem(FCM_TOKEN_KEY);
    if (!token || !getCapacitor()) return;
    await fetch("/api/mail/push-subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    /* never block sign-out on this */
  }
}
