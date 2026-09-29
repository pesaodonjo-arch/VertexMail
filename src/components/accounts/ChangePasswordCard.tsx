"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

/**
 * Requires the CURRENT password even though there's already a valid session.
 * Supabase's updateUser({ password }) doesn't ask for it — it trusts the
 * session alone — but that means anyone at an unlocked, already-signed-in
 * device could silently lock the real owner out. Re-verifying via
 * signInWithPassword first closes that gap, at the cost of one extra field.
 */
export function ChangePasswordCard({ loginEmail }: { loginEmail: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("New passwords don't match.");
    if (next === current) return setError("New password must be different from your current one.");

    setBusy(true);
    const supabase = createClient();

    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: loginEmail, password: current });
    if (verifyError) {
      setBusy(false);
      setError("Current password is incorrect.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCurrent(""); setNext(""); setConfirm("");
    setDone(true);
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-ink-200 bg-white p-4 shadow-panel">
      <p className="text-sm font-medium text-ink-800">Change password</p>
      <p className="mt-0.5 text-xs text-ink-400">Applies to signing in as {loginEmail}.</p>

      <div className="mt-3 space-y-2.5">
        <Input type="password" placeholder="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input type="password" placeholder="New password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        <Input type="password" placeholder="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>

      {error && <p className="mt-2 rounded-lg bg-accent-rose/10 px-3 py-2 text-xs text-accent-rose">{error}</p>}
      {done && <p className="mt-2 rounded-lg bg-accent-teal/10 px-3 py-2 text-xs text-accent-teal">Password updated.</p>}

      <Button type="submit" size="sm" className="mt-3" disabled={busy || !current || !next || !confirm}>
        {busy ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
