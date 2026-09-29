"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { VertexMark } from "@/components/ui/VertexMark";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { saveSession } from "@/lib/accounts";

export default function SignupPage() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, domain_name: domain }),
    });
    const data = await res.json();

    if (!res.ok) {
      setLoading(false);
      setError(data.message ?? (data.error === "domain_taken"
        ? "That domain is already registered on Vertex Mail."
        : "Couldn't create your account. Check your details and try again."));
      return;
    }

    // The signup route created the auth user with the service-role client,
    // so there's no browser session yet — sign in normally to establish one.
    const supabase = createClient();
    const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signedIn?.session) saveSession(signedIn.session);
    setLoading(false);
    if (signInError) {
      // Account exists but auto sign-in failed for some reason (rare) —
      // send them to log in manually rather than get stuck here.
      router.push("/login");
      return;
    }
    router.push("/admin/domains");
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-ink-50 px-4 vx-safe-top vx-safe-bottom">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <VertexMark size={40} />
          <div>
            <h1 className="font-display text-xl font-bold text-ink-900">Vertex Mail</h1>
            <p className="mt-1 text-sm text-ink-500">Run mail on your own domain</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-ink-200 bg-white p-6 shadow-panel">
          <div className="space-y-4">
            <div>
              <label htmlFor="domain" className="mb-1.5 block text-sm font-medium text-ink-700">
                Your domain
              </label>
              <Input
                id="domain" type="text" autoComplete="off" required
                placeholder="mycompany.com"
                value={domain} onChange={(e) => setDomain(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-ink-400">
                You'll need to add a DNS record to prove you own it — nothing works until that's verified.
              </p>
            </div>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink-700">
                Your email address
              </label>
              <Input
                id="email" type="email" autoComplete="email" required
                placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-700">
                Password
              </label>
              <Input
                id="password" type="password" autoComplete="new-password" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-accent-rose/10 px-3 py-2 text-sm text-accent-rose">{error}</p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Creating your account…" : "Create domain admin account"}
            </Button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-ink-400">
          Already have a mailbox?{" "}
          <a href="/login" className="font-medium text-brand-600 hover:underline">Sign in</a>
        </p>
      </div>
    </main>
  );
}
