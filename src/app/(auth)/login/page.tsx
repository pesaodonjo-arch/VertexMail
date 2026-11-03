"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { VertexMark } from "@/components/ui/VertexMark";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { saveSession } from "@/lib/accounts";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data: signedIn, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError("That email and password don't match a Vertex Mail account.");
      return;
    }
    // Remember this account on the device so it shows up in the account switcher.
    if (signedIn.session) saveSession(signedIn.session);

    const explicitNext = searchParams.get("next");
    if (explicitNext) {
      router.push(explicitNext);
      return;
    }

    // Not every account has a mailbox — a domain admin signed up via
    // /signup has admin access but nothing to show at /inbox. Check
    // my_context (mailbox_id / is_platform_admin / admin_domain_ids,
    // all resolved server-side under RLS) and send them somewhere useful.
    const { data: ctx } = await supabase.from("my_context").select("*").single();
    setLoading(false);

    if (ctx?.mailbox_id) {
      router.push("/inbox");
    } else if (ctx?.is_platform_admin || (ctx?.admin_domain_ids?.length ?? 0) > 0) {
      router.push("/admin");
    } else {
      // Confirmed account with neither a mailbox nor any admin access —
      // shouldn't normally happen, but land somewhere that explains it
      // rather than a silently empty inbox.
      router.push("/inbox");
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-ink-50 px-4 vx-safe-top vx-safe-bottom">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <VertexMark size={40} />
          <div>
            <h1 className="font-display text-xl font-bold text-ink-900">Vertex Mail</h1>
            <p className="mt-1 text-sm text-ink-500">Sign in to your mailbox</p>
            {searchParams.get("add") && (
              <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                Adding another account. Your current account stays signed in on this device.{" "}
                <a href="/inbox" className="font-semibold underline">Cancel</a>
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-ink-200 bg-white p-6 shadow-panel">
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink-700">
                Email address
              </label>
              <Input
                id="email" type="email" autoComplete="email" required
                placeholder="admin1@darasa.site"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-700">
                Password
              </label>
              <Input
                id="password" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-accent-rose/10 px-3 py-2 text-sm text-accent-rose">{error}</p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-ink-500">
          Mailboxes are created by your domain administrator.{" "}
          <a href="/signup" className="font-medium text-brand-600 hover:underline">
            Run your own domain? Sign up here.
          </a>
        </p>
      </div>
    </main>
  );
}
