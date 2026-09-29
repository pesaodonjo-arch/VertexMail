import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const supabase = createClient();

  // Every query here runs under RLS with the caller's own session, so a
  // domain admin automatically sees only their domain's numbers — the
  // page doesn't need to branch on role to stay correct.
  const [{ data: domains }, { data: mailboxes }, { data: usage }] = await Promise.all([
    supabase.from("domains").select("id, domain_name, status, created_at").order("created_at", { ascending: false }),
    supabase.from("mailboxes").select("id, status"),
    supabase.from("api_usage").select("id, status_code, created_at").order("created_at", { ascending: false }).limit(200),
  ]);

  const verifiedDomains = (domains ?? []).filter((d) => d.status === "verified").length;
  const activeMailboxes = (mailboxes ?? []).filter((m) => m.status === "active").length;
  const sentLast24h = (usage ?? []).filter(
    (u) => u.status_code === 200 && Date.now() - new Date(u.created_at).getTime() < 24 * 3600 * 1000
  ).length;
  const errorRate = usage && usage.length > 0
    ? Math.round((usage.filter((u) => u.status_code >= 400).length / usage.length) * 100)
    : 0;

  return (
    <>
      <AdminPageHeader title="Overview" description="Domains, mailboxes and API activity across your account." />
      <div className="grid grid-cols-2 gap-4 p-6 md:grid-cols-4">
        <StatCard label="Verified domains" value={verifiedDomains} hint={`${domains?.length ?? 0} total`} tone="brand" />
        <StatCard label="Active mailboxes" value={activeMailboxes} tone="teal" />
        <StatCard label="Emails sent (24h)" value={sentLast24h} />
        <StatCard label="API error rate" value={`${errorRate}%`} hint="last 200 requests" />
      </div>

      <div className="px-6 pb-8">
        <div className="rounded-xl border border-ink-200 bg-white">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink-800">Domains</h2>
            <Link href="/admin/domains" className="text-xs font-medium text-brand-600 hover:underline">
              Manage domains
            </Link>
          </div>
          <ul className="divide-y divide-ink-100">
            {(domains ?? []).slice(0, 6).map((d) => (
              <li key={d.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-ink-800">{d.domain_name}</span>
                <Badge tone={d.status === "verified" ? "success" : d.status === "suspended" ? "danger" : "warning"}>
                  {d.status}
                </Badge>
              </li>
            ))}
            {(domains ?? []).length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-ink-400">No domains added yet.</li>
            )}
          </ul>
        </div>
      </div>
    </>
  );
}
