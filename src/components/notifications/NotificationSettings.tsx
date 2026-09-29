"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  disableNotifications,
  enableNotifications,
  getNotifyState,
  showSystemNotification,
  type NotifyState,
} from "@/lib/notifications";

export function NotificationSettings() {
  const [state, setState] = useState<NotifyState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setState(getNotifyState()); }, []);

  async function turnOn() {
    setBusy(true);
    setState(await enableNotifications());
    setBusy(false);
  }

  const copy: Record<NotifyState, string> = {
    unsupported:
      "This browser can't show notifications. On iPhone or iPad, add Vertex Mail to your Home Screen first, then open it from there.",
    denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back here.",
    default: "Get an alert on this device when new mail arrives.",
    on: "On for this device. You'll get an alert when new mail arrives while Vertex Mail is open or in a background tab.",
    off: "Paused on this device.",
  };

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-panel">
      <div className="flex items-center gap-2">
        {state === "on" ? <Bell size={16} className="text-brand-600" /> : <BellOff size={16} className="text-ink-400" />}
        <p className="text-sm font-medium text-ink-800">New mail notifications</p>
      </div>
      {state && <p className="mt-1 text-xs text-ink-500">{copy[state]}</p>}

      {state === "default" && (
        <Button size="sm" className="mt-3" onClick={turnOn} disabled={busy}>Turn on notifications</Button>
      )}
      {state === "off" && (
        <Button size="sm" className="mt-3" onClick={turnOn} disabled={busy}>Turn on</Button>
      )}
      {state === "on" && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm" variant="secondary"
            onClick={() => showSystemNotification({ title: "Vertex Mail", body: "Notifications are working.", url: "/inbox", tag: "vx-test" })}
          >
            Send test
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setState(disableNotifications())}>Turn off</Button>
        </div>
      )}
    </div>
  );
}
