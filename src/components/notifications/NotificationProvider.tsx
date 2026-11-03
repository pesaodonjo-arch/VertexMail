"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Mail, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getNotifyState, registerServiceWorker, senderName, showSystemNotification } from "@/lib/notifications";

interface Toast { id: string; title: string; body: string; href: string }

interface NotificationContextValue {
  unread: number;
  /** Re-check unread count and re-fetch the current page's data from the server. */
  refresh: () => Promise<void>;
  refreshing: boolean;
  /** Full reload: drops Realtime connection + in-memory state and reloads the app. */
  restartApp: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  unread: 0,
  refresh: async () => {},
  refreshing: false,
  restartApp: async () => {},
});
export const useNotifications = () => useContext(NotificationContext);

const POLL_MS = 45_000;

/**
 * New-mail notification flow:
 *  1. Realtime: a new inbound message triggers an in-app toast (and an OS notification
 *     if the tab is in the background and the person turned notifications on).
 *  2. Polling every 45s + on tab focus keeps the unread count right even if Realtime
 *     isn't enabled (see supabase/migration_004_realtime_notifications.sql).
 *  3. The unread count feeds the Inbox badge, the tab title "(3) Vertex Mail",
 *     and the app-icon badge where the browser supports it.
 */
export function NotificationProvider({
  mailboxId,
  initialUnread,
  children,
}: {
  mailboxId?: string;
  initialUnread: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  const [unread, setUnreadState] = useState(initialUnread);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const unreadRef = useRef(initialUnread);
  const pathRef = useRef(pathname);
  const lastRealtimeAt = useRef(0);

  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  const setUnread = useCallback((n: number) => {
    unreadRef.current = n;
    setUnreadState(n);
  }, []);

  const dismiss = useCallback((id: string) => setToasts((cur) => cur.filter((t) => t.id !== id)), []);

  const announce = useCallback(
    (title: string, body: string, href: string) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((cur) => [...cur.slice(-2), { id, title, body, href }]);
      setTimeout(() => dismiss(id), 7000);
      if (document.visibilityState === "hidden") {
        void showSystemNotification({ title, body, url: href, tag: "vx-new-mail" });
      }
    },
    [dismiss]
  );

  const recount = useCallback(
    async (announceIncrease: boolean) => {
      const { count, error } = await supabase
        .from("threads")
        .select("id", { count: "exact", head: true })
        .eq("folder", "inbox")
        .eq("is_read", false);
      if (error || count == null) return;

      const gained = count - unreadRef.current;
      // Skip the generic alert if Realtime just announced this message with details.
      const realtimeJustFired = Date.now() - lastRealtimeAt.current < 15_000;
      if (announceIncrease && gained > 0 && !realtimeJustFired) {
        announce("New mail", gained === 1 ? "You have a new message" : `You have ${gained} new messages`, "/inbox");
      }
      setUnread(count);
      // Polling found new mail that Realtime missed — also refresh the list itself,
      // not just the badge, so it shows up without a manual refresh.
      if (gained > 0 && (pathRef.current.startsWith("/inbox") || pathRef.current.startsWith("/thread"))) {
        router.refresh();
      }
    },
    [supabase, announce, setUnread, router]
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await recount(true);
      router.refresh();
    } finally {
      // router.refresh() returns immediately; keep the spinner visible briefly.
      setTimeout(() => setRefreshing(false), 800);
    }
  }, [recount, router]);

  const restartApp = useCallback(async () => {
    try {
      void supabase.removeAllChannels();
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {
      /* best effort — reload regardless */
    }
    window.location.reload();
  }, [supabase]);

  // Live updates + polling fallback.
  useEffect(() => {
    if (!mailboxId) return;
    if (getNotifyState() === "on") void registerServiceWorker();

    const channel = supabase
      .channel(`mail:${mailboxId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `mailbox_id=eq.${mailboxId}` },
        async (payload) => {
          const m = payload.new as {
            direction?: string; is_draft?: boolean; from_address?: string; subject?: string; thread_id: string;
          };
          if (m.direction !== "inbound" || m.is_draft) return;

          // Mail added to a conversation you marked as spam shouldn't alert you.
          const { data: t } = await supabase.from("threads").select("folder").eq("id", m.thread_id).maybeSingle();
          if (t?.folder === "spam") return;
          lastRealtimeAt.current = Date.now();

          const viewingThisThread = pathRef.current === `/thread/${m.thread_id}` && document.visibilityState === "visible";
          if (!viewingThisThread) {
            announce(senderName(m.from_address), m.subject || "(no subject)", `/thread/${m.thread_id}`);
          }
          setTimeout(() => void recount(false), 400);
          if (pathRef.current.startsWith("/inbox") || pathRef.current.startsWith("/thread")) router.refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "threads", filter: `mailbox_id=eq.${mailboxId}` },
        () => void recount(false)
      )
      .subscribe();

    const poll = setInterval(() => void recount(true), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void recount(false);
      // Coming back to the app (e.g. resuming the Android app): pull fresh data.
      if (pathRef.current.startsWith("/inbox")) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [mailboxId, supabase, announce, recount, router]);

  // Opening a conversation marks it read on the server — pick that up after navigating.
  useEffect(() => {
    if (!mailboxId) return;
    const t = setTimeout(() => void recount(false), 600);
    return () => clearTimeout(t);
  }, [pathname, mailboxId, recount]);

  // Tab title + app-icon badge.
  useEffect(() => {
    const t = setTimeout(() => {
      const base = document.title.replace(/^\(\d+\)\s*/, "");
      document.title = unread > 0 ? `(${unread}) ${base}` : base;
      const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
      if (unread > 0) nav.setAppBadge?.(unread)?.catch(() => {});
      else nav.clearAppBadge?.()?.catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, [unread, pathname]);

  return (
    <NotificationContext.Provider value={{ unread, refresh, refreshing, restartApp }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 z-50 flex flex-col gap-2 md:inset-x-auto md:right-4 md:w-96"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      >
        {toasts.map((t) => (
          <div key={t.id} className="vx-keep vx-toast pointer-events-auto flex items-start gap-3 rounded-xl bg-ink-950 p-3 text-white shadow-lg">
            <Link href={t.href} onClick={() => dismiss(t.id)} className="flex min-w-0 flex-1 items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600">
                <Mail size={16} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{t.title}</span>
                <span className="block truncate text-xs text-ink-300">{t.body}</span>
              </span>
            </Link>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="rounded p-1 text-ink-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}
