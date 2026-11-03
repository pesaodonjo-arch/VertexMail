"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Plus } from "lucide-react";

interface Domain { id: string; domain_name: string; status: string }
interface Assignment { id: string; auth_user_id: string; domain_id: string; domains: { domain_name: string }; created_at: string }

export default function AdminUsersPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [email, setEmail] = useState("");
  const [domainId, setDomainId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [dRes, aRes] = await Promise.all([fetch("/api/admin/domains"), fetch("/api/admin/users")]);
    const d = await dRes.json();
    const a = await aRes.json();
    setDomains(d.domains ?? []);
    setAssignments(a.domain_admins ?? []);
    if (!domainId && d.domains?.length) setDomainId(d.domains[0].id);
  }

  useEffect(() => { load(); }, []);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, domain_id: domainId }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.message ?? data.error ?? "Couldn't assign that admin."); return; }
    setEmail("");
    load();
  }

  return (
    <>
      <AdminPageHeader
        title="Admin users"
        description="Domain admins can manage mailboxes and API keys only for the domain(s) they're assigned to."
      />
      <div className="p-4 md:p-6">
        <form onSubmit={assign} className="mb-5 flex flex-col gap-3 rounded-xl border border-ink-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-2">
          <div className="sm:min-w-[12rem] sm:flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Mailbox email</label>
            <Input placeholder="admin1@darasa.site" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Domain</label>
            <select className="h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm sm:w-auto" value={domainId} onChange={(e) => setDomainId(e.target.value)}>
              {domains.map((d) => <option key={d.id} value={d.id}>{d.domain_name}</option>)}
            </select>
          </div>
          <Button type="submit" className="w-full sm:w-auto" disabled={saving}><Plus size={16} /> {saving ? "Assigning…" : "Make domain admin"}</Button>
        </form>

        {error && <p className="mb-4 rounded-lg bg-accent-rose/10 px-3 py-2 text-sm text-accent-rose">{error}</p>}

        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
          <table className="vx-table w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs font-medium text-ink-500">
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Assigned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td className="vx-title px-4 py-3 font-medium text-ink-800">{a.domains?.domain_name}</td>
                  <td data-label="Assigned" className="px-4 py-3 text-ink-500">{new Date(a.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr><td colSpan={2} className="vx-empty px-4 py-8 text-center text-ink-500">No domain admins assigned yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
