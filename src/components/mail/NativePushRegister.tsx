"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FCM_TOKEN_KEY, getPushPlugin } from "@/lib/native-push";

/**
 * Renders nothing. Inside the Android app it:
 *  1. asks for notification permission (Android 13+ shows a system prompt),
 *  2. gets this phone's FCM token and saves it to the signed-in mailbox,
 *  3. opens the right conversation when a notification is tapped,
 *  4. refreshes the list when a mail arrives while the app is open.
 * In a normal browser it does nothing.
 */
export function NativePushRegister({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const Push = getPushPlugin();
    if (!Push) return;

    let cancelled = false;
    const handles: { remove: () => void }[] = [];

    (async () => {
      try {
        let perm = await Push.checkPermissions();
        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
          perm = await Push.requestPermissions();
        }
        if (perm.receive !== "granted" || cancelled) return;

        handles.push(
          await Push.addListener("registration", async (t: { value: string }) => {
            try {
              window.localStorage.setItem(FCM_TOKEN_KEY, t.value);
              await fetch("/api/mail/push-subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: t.value }),
              });
            } catch (e) {
              console.error("push register failed", e);
            }
          })
        );
        handles.push(await Push.addListener("registrationError", (e: unknown) => console.error("FCM error", e)));
        handles.push(await Push.addListener("pushNotificationReceived", () => router.refresh()));
        handles.push(
          await Push.addListener("pushNotificationActionPerformed", (action: any) => {
            const threadId = action?.notification?.data?.threadId;
            router.push(threadId ? `/thread/${threadId}` : "/inbox");
          })
        );

        await Push.register();
      } catch (e) {
        console.error("native push setup failed", e);
      }
    })();

    return () => {
      cancelled = true;
      handles.forEach((h) => h.remove());
    };
  }, [userId, router]);

  return null;
}
