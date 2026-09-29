"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Plus, Copy, Ban } from "lucide-react";

interface Domain { id: string; domain_name: string; status: string }
interface ApiKey {
  id: string; domain_id: string; name: string; key_prefix: string;
  status: "active" | "revoked"; created_at: string; last_used_at: string | null; domains: { domain_name: string };
}

export default function ApiKeysPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [domainId, setDomainId] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  async function load() {
    const [dRes, kRes] = await Promise.all([fetch("/api/admin/domains"), fetch("/api/admin/api-keys")]);
    const d = await dRes.json();
    const k = await kRes.json();
    setDomains((d.domains ?? []).filter((x: Domain) => x.status === "verified"));
    setKeys(k.api_keys ?? []);
    if (!domainId && d.domains?.length) setDomainId(d.domains[0].id);
  }

  useEffect(() => { load(); }, []);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/admin/api-keys", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain_id: domainId, name }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) { setNewSecret(data.secret); setName(""); load(); }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Any application using it will immediately stop being able to send.")) return;
    await fetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <AdminPageHeader
        title="API keys"
        description="Each key is scoped to one domain and can only send from mailboxes on that domain."
      />
      <div className="p-6">
        <form onSubmit={createKey} className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-ink-200 bg-white p-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Domain</label>
            <select className="h-11 rounded-lg border border-ink-200 bg-white px-3 text-sm" value={domainId} onChange={(e) => setDomainId(e.target.value)}>
              {domains.map((d) => <option key={d.id} value={d.id}>{d.domain_name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[10rem]">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Key name</label>
            <Input placeholder="Darasa signup flow" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <Button type="submit" disabled={creating || !domainId}><Plus size={16} /> {creating ? "Creating…" : "Create key"}</Button>
        </form>

        {newSecret && (
          <div className="mb-6 rounded-xl border border-accent-teal/30 bg-accent-teal/5 p-4">
            <p className="text-sm font-semibold text-ink-800">Copy this key now — it won't be shown again</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-white px-3 py-2">
              <code className="flex-1 truncate text-sm text-ink-700">{newSecret}</code>
              <button onClick={() => navigator.clipboard.writeText(newSecret)} className="text-ink-400 hover:text-ink-700">
                <Copy size={15} />
              </button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs font-medium text-ink-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last used</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-3 font-medium text-ink-800">{k.name}</td>
                  <td className="px-4 py-3 text-ink-600">{k.domains?.domain_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-500">{k.key_prefix}…</td>
                  <td className="px-4 py-3"><Badge tone={k.status === "active" ? "success" : "danger"}>{k.status}</Badge></td>
                  <td className="px-4 py-3 text-ink-500">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}</td>
                  <td className="px-4 py-3 text-right">
                    {k.status === "active" && (
                      <Button size="sm" variant="danger" onClick={() => revoke(k.id)}><Ban size={14} /> Revoke</Button>
                    )}
                  </td>
                </tr>
              ))}
              {keys.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-400">No API keys yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
