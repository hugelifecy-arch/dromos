'use client';

// Embed widget for hotel / agency tenants.
//
// Route: /concierge/embed/<slug>
//
// Public, unauthenticated. Renders as a self-contained quote form sized for
// an iframe (~560px tall). Guest types pick-up / drop-off districts + time
// + passenger count and sees a regulated quote. The quote is informational
// in v1 — we deliberately do NOT accept bookings over an unauthenticated
// iframe. The footer directs the guest to contact the hotel's concierge
// desk, which is how the hotel monetises the channel.
//
// Why quote-only: bookings over an unauth channel open a CSRF + fraud
// surface we don't want to own before we have a captcha / rate-limit /
// email-confirm flow. Adding those is fine — just a next-sprint task.
//
// Styling: no layout.tsx sibling, so this page inherits only the global
// root layout. Uses the same surface / brand colour tokens as the rest of
// Dromos for consistency when iframed.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const DISTRICTS: Array<{ value: string; label: string }> = [
  { value: 'nicosia', label: 'Nicosia' },
  { value: 'limassol', label: 'Limassol' },
  { value: 'larnaca', label: 'Larnaca' },
  { value: 'paphos', label: 'Paphos' },
  { value: 'famagusta', label: 'Famagusta' },
];

interface PricingShape {
  regulatedMeterEur: number;
  floorEur: number;
  ceilingEur: number;
  suggestedEur: number;
  discountPct: number;
  rationale: string[];
}

export default function ConciergeEmbed() {
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : Array.isArray(params?.slug) ? params.slug[0] : '';

  const [tenantName, setTenantName] = useState<string | null>(null);
  const [pickupDistrict, setPickupDistrict] = useState('limassol');
  const [dropoffDistrict, setDropoffDistrict] = useState('larnaca');
  const [pickupLocal, setPickupLocal] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [pricing, setPricing] = useState<PricingShape | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Nothing to prefetch — resolveTenantBySlug runs server-side inside the
    // quote endpoint. We rely on it to 404 if the slug is unknown and
    // surface that to the user.
  }, []);

  async function getQuote(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPricing(null);
    if (!pickupLocal) { setError('Please pick a time.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/concierge/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          pickupDistrict,
          dropoffDistrict,
          pickupIso: new Date(pickupLocal).toISOString(),
          passengerCount: passengers,
        }),
      });
      const body = await res.json();
      if (res.status === 404) throw new Error('This widget is not configured.');
      if (!res.ok) throw new Error(body.error || body.message || `HTTP ${res.status}`);
      setPricing(body.pricing as PricingShape);
      if (body.tenantName && !tenantName) setTenantName(body.tenantName as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get a quote');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-surface-950 text-white p-4">
      <div className="max-w-md mx-auto space-y-4">
        <header>
          <p className="text-xs uppercase tracking-wide text-surface-400">Dromos · Regulated Cyprus taxi</p>
          <h1 className="text-xl font-bold">
            {tenantName ? `Book with ${tenantName}` : 'Quote your transfer'}
          </h1>
        </header>

        <form onSubmit={getQuote} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="From">
              <select
                value={pickupDistrict}
                onChange={(e) => setPickupDistrict(e.target.value)}
                className="w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-sm"
              >
                {DISTRICTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </Field>
            <Field label="To">
              <select
                value={dropoffDistrict}
                onChange={(e) => setDropoffDistrict(e.target.value)}
                className="w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-sm"
              >
                {DISTRICTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Pick-up">
              <input
                type="datetime-local"
                value={pickupLocal}
                onChange={(e) => setPickupLocal(e.target.value)}
                required
                className="w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-sm"
              />
            </Field>
            <Field label="Guests">
              <input
                type="number" min={1} max={8}
                value={passengers}
                onChange={(e) => setPassengers(Math.max(1, Math.min(8, Number.parseInt(e.target.value, 10) || 1)))}
                className="w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-sm"
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl disabled:opacity-50"
          >
            {loading ? 'Getting quote…' : 'Get quote'}
          </button>
        </form>

        {error && (
          <div className="text-sm text-red-300 bg-red-400/10 rounded-xl px-3 py-2">{error}</div>
        )}

        {pricing && (
          <div className="rounded-xl border border-surface-800 bg-surface-900 p-4 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-surface-400">Quoted fare</p>
              <p className="text-3xl font-bold text-white">€{pricing.suggestedEur.toFixed(2)}</p>
              <p className="text-xs text-surface-500 mt-1">
                Regulated range €{pricing.floorEur.toFixed(2)} – €{pricing.ceilingEur.toFixed(2)}
              </p>
            </div>
            <ul className="text-xs text-surface-400 list-disc pl-4 space-y-0.5">
              {pricing.rationale.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <div className="rounded-lg bg-brand-600/10 border border-brand-600/30 p-3 text-xs text-brand-100">
              To confirm this booking, please speak with the concierge desk.
              This widget provides a regulated Cyprus meter quote only.
            </div>
          </div>
        )}

        <footer className="text-[11px] text-surface-500 pt-2 border-t border-surface-800">
          Powered by Dromos · All fares anchored to the Cyprus Ministry of Transport tariff.
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-surface-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
