"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveSession } from "@/lib/accounts";

/**
 * Renders nothing. Keeps this device's saved copy of the CURRENT account up to
 * date — Supabase rotates tokens as a session refreshes, and a stale saved
 * token would break switching back later. Also records the friendly label
 * (the mailbox address) the server already knows for this user.
 */
export function AccountSync({ userId, label }: { userId: string; label: string }) {
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user.id === userId) saveSession(session, label);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && session.user.id === userId) saveSession(session, label);
    });
    return () => data.subscription.unsubscribe();
  }, [userId, label]);

  return null;
}
