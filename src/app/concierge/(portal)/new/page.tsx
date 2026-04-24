'use client';

// Staff "new booking" flow.
//
// Four steps in one page:
//   1. Pick districts + time + passenger count.
//   2. Server returns a pricing snapshot (floor / suggested / ceiling +
//      rationale lines).
//   3. Staff enters guest name + phone.
//   4. Submit -> POST /api/concierge/bookings with the server-computed
//      suggested price (or a tweaked number within [floor, ceiling]).
//
// We deliberately DO NOT let the concierge bypass the pricing engine. Any
// manual price outside [floor, ceiling] is rejected server-side; the form
// mirrors that with client-side validation so the concierge sees the error
// before submit.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const DISTRICTS: Array<{ value: string; label: string }> = [
  { value: 'nicosia', label: 'Nicosia' },
  { value: 'limassol', label: 'Limassol' },
  { value: 'larnaca', label: 'Larnaca' },
  { value: 'paphos', label: 'Paphos' },
  { value: 'famagusta', label: 'Famagusta' },
];

interface TenantSummary {
  id: string; slug: string; name: string; type: 'hotel' | 'agency'; district: string; role: 'owner' | 'staff';
}

interface PricingShape {
  regulatedMeterEur: number;
  floorEur: number;
  ceilingEur: number;
  suggestedEur: number;
  discountPct: number;
  rationale: string[];
}

export default function NewConciergeBooking() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [tenantId, setTenantId] = useState('');

  const [pickupText, setPickupText] = useState('');
  const [pickupDistrict, setPickupDistrict] = useState('limassol');
  const [dropoffText, setDropoffText] = useState('');
  const [dropoffDistrict, setDropoffDistrict] = useState('larnaca');
  const [pickupLocal, setPickupLocal] = useState(''); // datetime-local
  const [passengerCount, setPassengerCount] = useState(1);

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [quotedPrice, setQuotedPrice] = useState('');
  const [notes, setNotes] = useState('');

  const [pricing, setPricing] = useState<PricingShape | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);

  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/concierge/tenants');
      if (!res.ok) return;
      const body = await res.json();
      setTenants(body.tenants);
      setTenantId(body.defaultTenantId);
      const t = (body.tenants as TenantSummary[]).find((x) => x.id === body.defaultTenantId);
      if (t) setPickupDistrict(t.district);
    })();
  }, []);

  async function getQuote() {
    setQuoteError('');
    setPricing(null);
    if (!pickupLocal) { setQuoteError('Pick-up time is required.'); return; }
    setQuoteLoading(true);
    try {
      const res = await fetch('/api/concierge/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          pickupDistrict,
          dropoffDistrict,
          pickupIso: new Date(pickupLocal).toISOString(),
          passengerCount,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || body.message || `HTTP ${res.status}`);
      setPricing(body.pricing as PricingShape);
      setQuotedPrice(String(body.pricing.suggestedEur));
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : 'Could not get a quote');
    }
    setQuoteLoading(false);
  }

  const quotedNumber = Number.parseFloat(quotedPrice);
  const quotedValid =
    pricing != null &&
    Number.isFinite(quotedNumber) &&
    quotedNumber >= pricing.floorEur &&
    quotedNumber <= pricing.ceilingEur;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');
    if (!pricing) { setSubmitError('Get a quote first.'); return; }
    if (!quotedValid) { setSubmitError('Price must be within floor/ceiling.'); return; }
    if (!guestName.trim()) { setSubmitError('Guest name is required.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/concierge/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          guestName: guestName.trim(),
          guestPhone: guestPhone.trim() || undefined,
          passengerCount,
          pickupText: pickupText || `${pickupDistrict}`,
          pickupDistrict,
          dropoffText: dropoffText || `${dropoffDistrict}`,
          dropoffDistrict,
          pickupIso: new Date(pickupLocal).toISOString(),
          quotedPriceEur: quotedNumber,
          notes: notes.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || body.message || `HTTP ${res.status}`);
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not place booking');
    }
    setSubmitting(false);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Link href="/concierge" className="inline-flex items-center gap-1 text-sm text-surface-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back to bookings
        </Link>
        <div className="rounded-xl border border-green-400/30 bg-green-400/10 p-6">
          <p className="font-semibold mb-1">Booking placed</p>
          <p className="text-sm text-green-200">
            The guest trip is in the driver queue. You&apos;ll see it under the Bookings tab, and it will transition to &quot;confirmed&quot; once a driver accepts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/concierge" className="inline-flex items-center gap-1 text-sm text-surface-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Back to bookings
      </Link>

      <h1 className="text-2xl font-bold">New booking</h1>

      <form onSubmit={submit} className="space-y-4">
        {tenants.length > 1 && (
          <Field label="Tenant">
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full bg-surface-900 border border-surface-800 rounded-xl px-4 py-2.5 text-white"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pick-up district">
            <DistrictSelect value={pickupDistrict} onChange={setPickupDistrict} />
          </Field>
          <Field label="Drop-off district">
            <DistrictSelect value={dropoffDistrict} onChange={setDropoffDistrict} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pick-up address / note" hint="Shown to the driver.">
            <input
              value={pickupText}
              onChange={(e) => setPickupText(e.target.value)}
              placeholder="Hotel lobby, main entrance…"
              className="w-full bg-surface-900 border border-surface-800 rounded-xl px-4 py-2.5 text-white"
            />
          </Field>
          <Field label="Drop-off address / note">
            <input
              value={dropoffText}
              onChange={(e) => setDropoffText(e.target.value)}
              placeholder="Larnaca Airport — Departures"
              className="w-full bg-surface-900 border border-surface-800 rounded-xl px-4 py-2.5 text-white"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pick-up time">
            <input
              type="datetime-local"
              value={pickupLocal}
              onChange={(e) => setPickupLocal(e.target.value)}
              required
              className="w-full bg-surface-900 border border-surface-800 rounded-xl px-4 py-2.5 text-white"
            />
          </Field>
          <Field label="Passengers">
            <input
              type="number" min={1} max={8}
              value={passengerCount}
              onChange={(e) => setPassengerCount(Math.max(1, Math.min(8, Number.parseInt(e.target.value, 10) || 1)))}
              className="w-full bg-surface-900 border border-surface-800 rounded-xl px-4 py-2.5 text-white"
            />
          </Field>
        </div>

        <div>
          <button
            type="button"
            onClick={getQuote}
            disabled={quoteLoading || !pickupLocal}
            className="bg-surface-800 hover:bg-surface-700 text-white text-sm px-4 py-2 rounded-xl disabled:opacity-50"
          >
            {quoteLoading ? 'Getting quote…' : (pricing ? 'Refresh quote' : 'Get regulated quote')}
          </button>
          {quoteError && <p className="text-sm text-red-300 mt-2">{quoteError}</p>}
        </div>

        {pricing && (
          <div className="rounded-xl border border-surface-800 bg-surface-900 p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Stat label="Floor" value={`€${pricing.floorEur.toFixed(2)}`} />
              <Stat label="Suggested" value={`€${pricing.suggestedEur.toFixed(2)}`} emphasised />
              <Stat label="Ceiling" value={`€${pricing.ceilingEur.toFixed(2)}`} />
            </div>
            <ul className="text-xs text-surface-400 list-disc pl-4 space-y-0.5">
              {pricing.rationale.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <Field label={`Quoted to guest (€${pricing.floorEur.toFixed(2)} – €${pricing.ceilingEur.toFixed(2)})`}>
              <input
                type="number" step="0.01"
                value={quotedPrice}
                onChange={(e) => setQuotedPrice(e.target.value)}
                className={`w-full bg-surface-900 border rounded-xl px-4 py-2.5 text-white ${quotedValid ? 'border-surface-800' : 'border-red-400/50'}`}
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Guest name *">
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              required
              className="w-full bg-surface-900 border border-surface-800 rounded-xl px-4 py-2.5 text-white"
            />
          </Field>
          <Field label="Guest phone">
            <input
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="+357…"
              className="w-full bg-surface-900 border border-surface-800 rounded-xl px-4 py-2.5 text-white"
            />
          </Field>
        </div>

        <Field label="Notes for the driver">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full bg-surface-900 border border-surface-800 rounded-xl px-4 py-2.5 text-white"
          />
        </Field>

        {submitError && <p className="text-sm text-red-300">{submitError}</p>}

        <button
          type="submit"
          disabled={submitting || !pricing || !quotedValid}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl disabled:opacity-50"
        >
          {submitting ? 'Placing…' : 'Place booking'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-surface-400">{label}</span>
      {hint && <span className="block text-xs text-surface-500 mt-0.5">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function DistrictSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-surface-900 border border-surface-800 rounded-xl px-4 py-2.5 text-white"
    >
      {DISTRICTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
    </select>
  );
}

function Stat({ label, value, emphasised }: { label: string; value: string; emphasised?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${emphasised ? 'bg-brand-600/20 border border-brand-600/40' : 'bg-surface-800'}`}>
      <div className="text-xs uppercase text-surface-400">{label}</div>
      <div className={`font-semibold ${emphasised ? 'text-brand-200' : 'text-white'}`}>{value}</div>
    </div>
  );
}
