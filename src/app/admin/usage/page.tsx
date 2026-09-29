import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const supabase = createClient();

  // RLS (api_usage_select) already scopes this to the caller's domains —
  // a domain admin only ever sees their own domain's send activity.
  const { data: usage } = await supabase
    .from("api_usage")
    .select("id, endpoint, status_code, error_code, created_at, domains(domain_name), api_keys(name)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <AdminPageHeader title="Usage" description="Recent activity on the send API, most recent first." />
      <div className="p-6">
        <div className="rounded-xl border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs font-medium text-ink-400">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">API key</th>
                <th className="px-4 py-3">Endpoint</th>
                <th className="px-4 py-3">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {(usage ?? []).map((u: any) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 text-ink-500">{new Date(u.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium text-ink-800">{u.domains?.domain_name}</td>
                  <td className="px-4 py-3 text-ink-600">{u.api_keys?.name ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-500">{u.endpoint}</td>
                  <td className="px-4 py-3">
                    {u.status_code < 300 ? (
                      <Badge tone="success">{u.status_code} sent</Badge>
                    ) : (
                      <Badge tone="danger">{u.status_code} {u.error_code}</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {(usage ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-400">No API activity yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
