'use client';

// Read-only tenant settings for the concierge skeleton.
//
// Intentionally minimal for S15: shows tenant name, type, district, and
// — crucially — the embed-widget URL the hotel's web team needs to paste
// into their booking page / PMS.
//
// Editable fields (seat count, contact details, staff invitations) are
// deliberately out of scope for the skeleton — they need a separate
// ownership-check flow and are better handled once real tenants are
// onboarded. Owners can contact partners@ for now.

import { useEffect, useState } from 'react';
import { Building2, Copy, Check } from 'lucide-react';

interface TenantSummary {
  id: string; slug: string; name: string; type: 'hotel' | 'agency'; district: string; role: 'owner' | 'staff';
}

export default function ConciergeSettings() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/concierge/tenants');
      if (!res.ok) return;
      const body = await res.json();
      setTenants(body.tenants);
      setTenantId(body.defaultTenantId);
    })();
  }, []);

  const tenant = tenants.find((t) => t.id === tenantId);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  if (!tenant) return <p className="text-surface-400">Loading…</p>;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedUrl = `${origin}/concierge/embed/${tenant.slug}`;
  const iframeSnippet = `<iframe src="${embedUrl}" width="100%" height="560" frameborder="0" style="border:0;border-radius:12px" title="Book a taxi — Dromos"></iframe>`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5 text-brand-400" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {tenants.length > 1 && (
        <select
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          className="bg-surface-900 border border-surface-800 rounded-xl px-3 py-2 text-sm"
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}

      <section className="rounded-xl border border-surface-800 bg-surface-900 p-5 space-y-3">
        <h2 className="font-semibold">Tenant</h2>
        <Row label="Name" value={tenant.name} />
        <Row label="Type" value={tenant.type} />
        <Row label="District" value={tenant.district} />
        <Row label="Your role" value={tenant.role} />
        <Row label="Slug" value={tenant.slug} mono />
      </section>

      <section className="rounded-xl border border-surface-800 bg-surface-900 p-5 space-y-4">
        <div>
          <h2 className="font-semibold">Embed widget</h2>
          <p className="text-sm text-surface-400 mt-1">
            Paste the iframe below into your hotel&apos;s booking page or PMS.
            It shows guests a regulated quote against the Cyprus meter tariff.
            The widget is quote-only in v1 — guests confirm the booking by
            contacting your front desk.
          </p>
        </div>
        <CodeBlock label="Public URL" text={embedUrl} onCopy={() => copy(embedUrl, 'url')} copied={copied === 'url'} />
        <CodeBlock label="iFrame snippet" text={iframeSnippet} onCopy={() => copy(iframeSnippet, 'iframe')} copied={copied === 'iframe'} />
      </section>

      <section className="rounded-xl border border-surface-800 bg-surface-900 p-5 text-sm text-surface-400">
        <p>
          Need to change contact details, add staff, or adjust your seat count?
          Reach out to <a href="mailto:partners@dromos.cy" className="text-brand-400 underline">partners@dromos.cy</a>.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-surface-400">{label}</span>
      <span className={mono ? 'font-mono text-white' : 'text-white'}>{value}</span>
    </div>
  );
}

function CodeBlock({ label, text, onCopy, copied }: { label: string; text: string; onCopy: () => void; copied: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-wide text-surface-400">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1 text-xs text-surface-300 hover:text-white"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="bg-surface-950 border border-surface-800 rounded-lg p-3 text-xs text-surface-200 font-mono whitespace-pre-wrap break-all">{text}</pre>
    </div>
  );
}
