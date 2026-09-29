"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Plus, Pause, Play, Trash2, KeyRound } from "lucide-react";

interface Domain { id: string; domain_name: string; status: string }
interface Mailbox {
  id: string; domain_id: string; local_part: string; display_name: string | null;
  status: "active" | "suspended" | "deleted"; created_at: string; domains: { domain_name: string };
  is_admin_linked: boolean;
}

export default function MailboxesPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [domainId, setDomainId] = useState("");
  const [localPart, setLocalPart] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string; reset?: boolean } | null>(null);
  const [forSelf, setForSelf] = useState(false);
  const [linkedEmail, setLinkedEmail] = useState<string | null>(null);
  const router = useRouter();

  async function load() {
    const [dRes, mRes] = await Promise.all([fetch("/api/admin/domains"), fetch("/api/admin/mailboxes")]);
    const d = await dRes.json();
    const m = await mRes.json();
    setDomains((d.domains ?? []).filter((x: Domain) => x.status === "verified"));
    setMailboxes(m.mailboxes ?? []);
    if (!domainId && d.domains?.length) setDomainId(d.domains[0].id);
  }

  useEffect(() => { load(); }, []);

  async function createMailbox(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setCredentials(null);
    setLinkedEmail(null);
    const res = await fetch("/api/admin/mailboxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain_id: domainId, local_part: localPart, for_self: forSelf }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { setError(data.message ?? data.error ?? "Couldn't create that mailbox."); return; }
    setLocalPart("");
    if (data.linked_to_you) {
      setLinkedEmail(data.email);
      setForSelf(false);
      router.refresh(); // re-render the admin layout so the "Switch to Mailbox" button appears
    } else {
      setCredentials({ email: data.email, password: data.temporary_password });
    }
    load();
  }

  async function setStatus(id: string, status: "active" | "suspended") {
    await fetch(`/api/admin/mailboxes/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    load();
  }

  async function resetPassword(id: string) {
    if (!confirm("Reset this mailbox's password? The current password stops working immediately, and this new one is shown once.")) return;
    setError(null);
    const res = await fetch(`/api/admin/mailboxes/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset_password: true }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.message ?? data.error ?? "Couldn't reset that password."); return; }
    setLinkedEmail(null);
    setCredentials({ email: data.email, password: data.temporary_password, reset: true });
  }

  async function remove(id: string) {
    if (!confirm("Delete this mailbox? Mail is retained per your retention policy, but sign-in is disabled immediately.")) return;
    await fetch(`/api/admin/mailboxes/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <AdminPageHeader title="Mailboxes" description="Up to 10 mailboxes per verified domain." />

      <div className="p-6">
        <form onSubmit={createMailbox} className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-ink-200 bg-white p-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Domain</label>
            <select
              className="h-11 rounded-lg border border-ink-200 bg-white px-3 text-sm"
              value={domainId} onChange={(e) => setDomainId(e.target.value)}
            >
              {domains.map((d) => <option key={d.id} value={d.id}>{d.domain_name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[10rem]">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Mailbox name</label>
            <div className="flex items-center gap-1.5">
              <Input placeholder="admin1" value={localPart} onChange={(e) => setLocalPart(e.target.value)} required />
              <span className="whitespace-nowrap text-sm text-ink-400">
                @{domains.find((d) => d.id === domainId)?.domain_name ?? "domain"}
              </span>
            </div>
          </div>
          <Button type="submit" disabled={creating || !domainId}>
            <Plus size={16} /> {creating ? "Creating…" : "Create mailbox"}
          </Button>
          <label className="flex w-full items-start gap-2 text-sm text-ink-600">
            <input
              type="checkbox" className="mt-0.5" checked={forSelf}
              onChange={(e) => setForSelf(e.target.checked)}
            />
            <span>
              <span className="font-medium text-ink-800">This is my own mailbox.</span>{" "}
              Link it to the login I'm using now, so I can switch between Admin and my inbox without signing out.
              Leave unchecked to create a separate account for someone else.
            </span>
          </label>
        </form>

        {error && <p className="mb-4 rounded-lg bg-accent-rose/10 px-3 py-2 text-sm text-accent-rose">{error}</p>}

        {linkedEmail && (
          <div className="mb-6 rounded-xl border border-accent-teal/30 bg-accent-teal/5 p-4">
            <p className="text-sm font-semibold text-ink-800">Your mailbox is ready</p>
            <p className="mt-1 font-mono text-sm text-ink-700">{linkedEmail}</p>
            <p className="mt-2 text-xs text-ink-500">
              It's linked to your current login — no new password. Use “Switch to Mailbox” in the sidebar, or{" "}
              <Link href="/inbox" className="font-medium text-brand-600 hover:underline">open your inbox</Link>.
              Sign in with the same email and password you use now.
            </p>
          </div>
        )}

        {credentials && (
          <div className="mb-6 rounded-xl border border-accent-teal/30 bg-accent-teal/5 p-4">
            <p className="text-sm font-semibold text-ink-800">{credentials.reset ? "Password reset" : "Mailbox created"}</p>
            <p className="mt-1 font-mono text-sm text-ink-700">{credentials.email}</p>
            <p className="font-mono text-sm text-ink-700">
              {credentials.reset ? "New temporary" : "Temporary"} password: {credentials.password}
            </p>
            <p className="mt-2 text-xs text-ink-500">Share this securely — it won't be shown again.</p>
          </div>
        )}

        <div className="rounded-xl border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs font-medium text-ink-400">
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {mailboxes.filter((m) => m.status !== "deleted").map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 font-medium text-ink-800">{m.local_part}@{m.domains?.domain_name}</td>
                  <td className="px-4 py-3">
                    <Badge tone={m.status === "active" ? "success" : "danger"}>{m.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-500">{new Date(m.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1.5">
                      <Button
                        size="sm" variant="secondary"
                        onClick={() => resetPassword(m.id)}
                        disabled={m.is_admin_linked}
                        title={m.is_admin_linked ? "Linked to an admin login — they reset it from Account settings instead" : "Reset password"}
                      >
                        <KeyRound size={14} /> Reset password
                      </Button>
                      {m.status === "active" ? (
                        <Button size="sm" variant="secondary" onClick={() => setStatus(m.id, "suspended")}>
                          <Pause size={14} /> Suspend
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setStatus(m.id, "active")}>
                          <Play size={14} /> Reactivate
                        </Button>
                      )}
                      <Button size="sm" variant="danger" onClick={() => remove(m.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {mailboxes.filter((m) => m.status !== "deleted").length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-400">No mailboxes yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
