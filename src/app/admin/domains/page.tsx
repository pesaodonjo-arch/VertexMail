"use client";

import React, { useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Plus, ShieldCheck, Clock, Copy, Check, ChevronDown, Mail, Save } from "lucide-react";

interface Domain {
  id: string;
  domain_name: string;
  status: "pending" | "verified" | "suspended";
  max_mailboxes: number;
  created_at: string;
  verification_token: string;
  mailboxes: { count: number }[];
}

interface DnsRecord { type: string; host: string; value: string; priority?: number }

interface EmailSettings {
  provider: "smtp2go" | "resend" | "mailgun";
  api_key_set: boolean;
  mailgun_domain: string | null;
  resend_webhook_secret_set: boolean;
  using_platform_default: boolean;
}

interface EmailForm {
  provider: "smtp2go" | "resend" | "mailgun";
  apiKeyInput: string; // blank = leave the saved key unchanged
  mailgunDomain: string;
  resendWebhookSecretInput: string; // blank = leave the saved secret unchanged
}

function dnsRecordsFor(domainName: string, verificationToken: string): DnsRecord[] {
  return [
    { type: "TXT", host: `_vertex-verify.${domainName}`, value: verificationToken },
    { type: "MX", host: domainName, value: "route1.mx.cloudflare.net", priority: 10 },
    { type: "MX", host: domainName, value: "route2.mx.cloudflare.net", priority: 20 },
    { type: "TXT", host: domainName, value: "v=spf1 include:spf.smtp2go.com ~all" },
    { type: "TXT", host: `_dmarc.${domainName}`, value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@" + domainName },
  ];
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devSkipNotice, setDevSkipNotice] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [emailExpandedId, setEmailExpandedId] = useState<string | null>(null);
  const [emailSettings, setEmailSettings] = useState<Record<string, EmailSettings>>({});
  const [emailForm, setEmailForm] = useState<Record<string, EmailForm>>({});
  const [savingEmailId, setSavingEmailId] = useState<string | null>(null);
  const [emailSaveNotice, setEmailSaveNotice] = useState<string | null>(null);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  }

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/domains");
    const data = await res.json();
    setDomains(data.domains ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    const res = await fetch("/api/admin/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain_name: newDomain }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) { setError(data.message ?? data.error ?? "Couldn't add that domain."); return; }
    setNewDomain("");
    setExpandedId(data.domain.id);
    load();
  }

  async function verify(id: string, devToken?: string) {
    setVerifyingId(id);
    setDevSkipNotice(null);
    const res = await fetch(`/api/admin/domains/${id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(devToken ? { dev_token: devToken } : {}),
    });
    const data = await res.json();
    setVerifyingId(null);
    if (!res.ok) { setError(data.message ?? data.error ?? "Verification failed."); return; }
    if (data.dev_skip) {
      setDevSkipNotice(`"${data.domain.domain_name}" was verified via the dev token — no DNS record was actually checked. Anyone with that token can do this to any domain; rotate or remove SKIP_DOMAIN_VERIFICATION when you're done testing.`);
    }
    load();
  }

  function skipWithToken(id: string) {
    const token = window.prompt("Enter SKIP_DOMAIN_VERIFICATION_TOKEN to verify without checking DNS:");
    if (!token) return;
    verify(id, token);
  }

  async function toggleEmailPanel(id: string) {
    if (emailExpandedId === id) { setEmailExpandedId(null); return; }
    setEmailExpandedId(id);
    setEmailSaveNotice(null);
    if (!emailSettings[id]) {
      const res = await fetch(`/api/admin/domains/${id}/email-settings`);
      const data = await res.json();
      setEmailSettings((prev) => ({ ...prev, [id]: data }));
      setEmailForm((prev) => ({
        ...prev,
        [id]: { provider: data.provider, apiKeyInput: "", mailgunDomain: data.mailgun_domain ?? "", resendWebhookSecretInput: "" },
      }));
    }
  }

  function updateEmailForm(id: string, patch: Partial<EmailForm>) {
    setEmailForm((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function saveEmailSettings(id: string, domainName: string) {
    const form = emailForm[id];
    if (!form) return;
    if (form.provider === "mailgun" && form.apiKeyInput && !form.mailgunDomain) {
      setEmailSaveNotice("Enter the domain name you registered in your Mailgun account.");
      return;
    }
    setSavingEmailId(id);
    setEmailSaveNotice(null);
    const res = await fetch(`/api/admin/domains/${id}/email-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: form.provider,
        api_key: form.apiKeyInput || undefined, // blank = leave the existing key alone
        mailgun_domain: form.provider === "mailgun" ? form.mailgunDomain : null,
        resend_webhook_secret: form.provider === "resend" ? (form.resendWebhookSecretInput || undefined) : null,
      }),
    });
    const data = await res.json();
    setSavingEmailId(null);
    if (!res.ok) { setEmailSaveNotice(data.message ?? data.error ?? "Couldn't save."); return; }
    setEmailSettings((prev) => ({ ...prev, [id]: { ...data, using_platform_default: !data.api_key_set } }));
    setEmailForm((prev) => ({ ...prev, [id]: { ...prev[id], apiKeyInput: "", resendWebhookSecretInput: "" } }));
    setEmailSaveNotice(`Saved — ${domainName} now sends via ${data.provider}${data.api_key_set ? " using its own key" : " using the platform default key"}.`);
  }

  async function resetEmailToDefault(id: string, domainName: string) {
    setSavingEmailId(id);
    const res = await fetch(`/api/admin/domains/${id}/email-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "smtp2go", api_key: null, mailgun_domain: null, resend_webhook_secret: null }),
    });
    const data = await res.json();
    setSavingEmailId(null);
    if (!res.ok) { setEmailSaveNotice(data.message ?? data.error ?? "Couldn't reset."); return; }
    setEmailSettings((prev) => ({ ...prev, [id]: { ...data, using_platform_default: true } }));
    setEmailForm((prev) => ({ ...prev, [id]: { provider: "smtp2go", apiKeyInput: "", mailgunDomain: "", resendWebhookSecretInput: "" } }));
    setEmailSaveNotice(`${domainName} is back to using the platform's default provider.`);
  }

  return (
    <>
      <AdminPageHeader
        title="Domains"
        description="Connect a domain, add its DNS records, then verify to start sending and receiving."
      />

      <div className="p-4 md:p-6">
        <form onSubmit={addDomain} className="mb-5 flex flex-col gap-3 rounded-xl border border-ink-200 bg-white p-4 sm:flex-row sm:items-end sm:gap-2">
          <div className="sm:flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Add a domain</label>
            <Input
              placeholder="darasa.site" value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full sm:w-auto" disabled={adding}>
            <Plus size={16} /> {adding ? "Adding…" : "Add domain"}
          </Button>
        </form>

        {error && <p className="mb-4 rounded-lg bg-accent-rose/10 px-3 py-2 text-sm text-accent-rose">{error}</p>}
        {devSkipNotice && (
          <p className="mb-4 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">⚠️ {devSkipNotice}</p>
        )}

        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
          <table className="vx-table w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs font-medium text-ink-500">
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Mailboxes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {domains.map((d) => {
                const isOpen = expandedId === d.id;
                const records = dnsRecordsFor(d.domain_name, d.verification_token);
                return (
                  <React.Fragment key={d.id}>
                    <tr>
                      <td className="vx-title px-4 py-3 font-medium text-ink-800">{d.domain_name}</td>
                      <td data-label="Status" className="px-4 py-3">
                        <Badge tone={d.status === "verified" ? "success" : d.status === "suspended" ? "danger" : "warning"}>
                          {d.status}
                        </Badge>
                      </td>
                      <td data-label="Mailboxes" className="px-4 py-3 text-ink-600">{d.mailboxes?.[0]?.count ?? 0} / {d.max_mailboxes}</td>
                      <td className="vx-actions px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {d.status !== "verified" && (
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => setExpandedId(isOpen ? null : d.id)}
                            >
                              DNS records <ChevronDown size={14} className={isOpen ? "rotate-180" : ""} />
                            </Button>
                          )}
                          {d.status !== "verified" && (
                            <Button size="sm" variant="secondary" onClick={() => verify(d.id)} disabled={verifyingId === d.id}>
                              {verifyingId === d.id ? <Clock size={14} /> : <ShieldCheck size={14} />}
                              {verifyingId === d.id ? "Checking…" : "Verify"}
                            </Button>
                          )}
                          {d.status !== "verified" && (
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => skipWithToken(d.id)}
                              disabled={verifyingId === d.id}
                              title="Skip the DNS check using SKIP_DOMAIN_VERIFICATION_TOKEN"
                            >
                              Skip (dev)
                            </Button>
                          )}
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => toggleEmailPanel(d.id)}
                          >
                            <Mail size={14} /> Email provider
                            <ChevronDown size={14} className={emailExpandedId === d.id ? "rotate-180" : ""} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {emailExpandedId === d.id && (
                      <tr className="vx-panel">
                        <td colSpan={4} className="vx-full bg-ink-50 px-4 py-4">
                          {!emailForm[d.id] ? (
                            <p className="text-sm text-ink-500">Loading…</p>
                          ) : (
                            <div className="max-w-xl space-y-3">
                              <p className="text-sm font-semibold text-ink-800">
                                Email provider for {d.domain_name}
                              </p>
                              <p className="text-xs text-ink-500">
                                {emailSettings[d.id]?.using_platform_default
                                  ? "Currently using the platform's default provider (from the app's env vars)."
                                  : `Currently using its own ${emailSettings[d.id]?.provider} key.`}
                              </p>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-ink-600">Provider</label>
                                <select
                                  className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
                                  value={emailForm[d.id].provider}
                                  onChange={(e) => updateEmailForm(d.id, { provider: e.target.value as EmailForm["provider"] })}
                                >
                                  <option value="smtp2go">SMTP2GO</option>
                                  <option value="resend">Resend</option>
                                  <option value="mailgun">Mailgun</option>
                                </select>
                              </div>

                              {emailForm[d.id].provider === "mailgun" && (
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-ink-600">
                                    Mailgun domain (the domain name registered in your Mailgun account)
                                  </label>
                                  <Input
                                    placeholder={d.domain_name}
                                    value={emailForm[d.id].mailgunDomain}
                                    onChange={(e) => updateEmailForm(d.id, { mailgunDomain: e.target.value })}
                                  />
                                </div>
                              )}

                              <div>
                                <label className="mb-1 block text-xs font-medium text-ink-600">
                                  API key {emailSettings[d.id]?.api_key_set && "(already set — leave blank to keep it)"}
                                </label>
                                <Input
                                  type="password"
                                  placeholder={emailSettings[d.id]?.api_key_set ? "••••••••••••" : "Paste this domain's provider API key"}
                                  value={emailForm[d.id].apiKeyInput}
                                  onChange={(e) => updateEmailForm(d.id, { apiKeyInput: e.target.value })}
                                />
                              </div>

                              {emailForm[d.id].provider === "resend" && (
                                <div className="rounded-lg border border-ink-200 bg-white p-3 space-y-3">
                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-ink-600">
                                      Webhook URL — add this in Resend → Webhooks (event: email.received)
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <code className="flex-1 truncate rounded-md bg-ink-50 px-2 py-1.5 text-xs text-ink-700">
                                        {typeof window !== "undefined" ? window.location.origin : ""}/api/inbound/resend/{d.id}
                                      </code>
                                      <button
                                        type="button"
                                        onClick={() => copy(`${window.location.origin}/api/inbound/resend/${d.id}`, `webhook-${d.id}`)}
                                        className="shrink-0 rounded-md p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-700"
                                        title="Copy webhook URL"
                                      >
                                        {copiedKey === `webhook-${d.id}` ? <Check size={14} className="text-accent-emerald" /> : <Copy size={14} />}
                                      </button>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-ink-600">
                                      Webhook signing secret {emailSettings[d.id]?.resend_webhook_secret_set && "(already set — leave blank to keep it)"}
                                    </label>
                                    <Input
                                      type="password"
                                      placeholder={emailSettings[d.id]?.resend_webhook_secret_set ? "••••••••••••" : "whsec_… shown once when you create the webhook"}
                                      value={emailForm[d.id].resendWebhookSecretInput}
                                      onChange={(e) => updateEmailForm(d.id, { resendWebhookSecretInput: e.target.value })}
                                    />
                                  </div>
                                  <p className="text-xs text-ink-500">
                                    Without this secret, incoming mail can't be verified and receiving won't work — sending will still work with just the API key above.
                                  </p>
                                </div>
                              )}

                              {emailSaveNotice && (
                                <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">{emailSaveNotice}</p>
                              )}

                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => saveEmailSettings(d.id, d.domain_name)}
                                  disabled={savingEmailId === d.id}
                                >
                                  <Save size={14} /> {savingEmailId === d.id ? "Saving…" : "Save"}
                                </Button>
                                {!emailSettings[d.id]?.using_platform_default && (
                                  <Button
                                    size="sm" variant="ghost"
                                    onClick={() => resetEmailToDefault(d.id, d.domain_name)}
                                    disabled={savingEmailId === d.id}
                                  >
                                    Use platform default instead
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    {isOpen && (
                      <tr className="vx-panel">
                        <td colSpan={4} className="vx-full bg-brand-50 px-4 py-4">
                          <p className="mb-3 text-sm font-semibold text-brand-800">
                            Add these DNS records at your registrar for {d.domain_name}
                          </p>
                          <div className="space-y-2 overflow-x-auto">
                            {records.map((r, i) => {
                              const key = `${d.id}-${i}`;
                              return (
                                <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg bg-white px-3 py-2 text-xs">
                                  <span className="w-14 shrink-0 font-mono font-semibold text-brand-700">{r.type}</span>
                                  <span className="min-w-[10rem] break-all font-mono text-ink-700">{r.host}</span>
                                  <span className="flex-1 break-all font-mono text-ink-500">{r.value}</span>
                                  <button
                                    type="button"
                                    onClick={() => copy(r.value, key)}
                                    className="shrink-0 rounded-md p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-700"
                                    title="Copy value"
                                  >
                                    {copiedKey === key ? <Check size={14} className="text-accent-emerald" /> : <Copy size={14} />}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <p className="mt-3 text-xs text-brand-700">
                            The TXT record on <span className="font-mono">_vertex-verify.{d.domain_name}</span> is what "Verify" checks — the rest (MX, SPF, DMARC) are needed for mail to actually flow, but aren't required to pass verification. DNS can take a few minutes to propagate.
                          </p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!loading && domains.length === 0 && (
                <tr><td colSpan={4} className="vx-empty px-4 py-8 text-center text-ink-500">No domains yet — add one above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
