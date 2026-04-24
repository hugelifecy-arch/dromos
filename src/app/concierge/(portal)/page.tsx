'use client';

// Concierge booking inbox.
//
// Default landing page at /concierge. Shows this tenant's recent bookings
// with status, pickup window, guest name, quoted price. Sorted most-recent
// first; pagination deferred until real data volume demands it.
//
// If the signed-in user is not a tenant member they get a 403 from the
// /api/concierge/tenants endpoint and we render a "request access" copy
// block. This is the same surface the marketing site points hotels at, so
// the copy has to be approachable for a non-technical visitor.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Building2, Plus } from 'lucide-react';

interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  type: 'hotel' | 'agency';
  district: string;
  role: 'owner' | 'staff';
}

interface BookingRow {
  id: string;
  tenant_id: string;
  leg_id: string | null;
  guest_name: string;
  guest_phone: string | null;
  passenger_count: number;
  pickup_text: string;
  pickup_district: string;
  dropoff_text: string;
  dropoff_district: string;
  pickup_ts: string;
  quoted_price_eur: number;
  status: 'quoted' | 'placed' | 'confirmed' | 'cancelled' | 'expired';
  source: 'staff' | 'embed_widget';
  created_at: string;
}

const STATUS_STYLES: Record<BookingRow['status'], string> = {
  quoted:    'bg-surface-800 text-surface-300',
  placed:    'bg-brand-400/10 text-brand-300',
  confirmed: 'bg-green-400/10 text-green-300',
  cancelled: 'bg-red-400/10 text-red-300',
  expired:   'bg-surface-800 text-surface-500',
};

export default function ConciergeInbox() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'not_member' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/concierge/tenants');
        if (res.status === 401) { setState('unauthorized'); return; }
        if (res.status === 403) { setState('not_member'); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        setTenants(body.tenants);
        setTenantId(body.defaultTenantId);
        setState('ready');
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Failed to load tenants');
        setState('error');
      }
    })();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const res = await fetch(`/api/concierge/bookings?tenantId=${encodeURIComponent(tenantId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        setBookings(body.bookings as BookingRow[]);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Failed to load bookings');
      }
    })();
  }, [tenantId]);

  if (state === 'loading') return <p className="text-surface-400">Loading…</p>;
  if (state === 'unauthorized') return <AuthRequired />;
  if (state === 'not_member') return <NotAMember />;
  if (state === 'error') return <ErrorBox msg={errorMsg} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Bookings</h1>
          {tenants.length > 1 && (
            <select
              className="mt-2 bg-surface-900 border border-surface-800 rounded-lg px-3 py-1.5 text-sm"
              value={tenantId ?? ''}
              onChange={(e) => setTenantId(e.target.value)}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>
        <Link
          href="/concierge/new"
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> New booking
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="rounded-xl border border-surface-800 bg-surface-900 p-6 text-center text-surface-400">
          <p className="text-white mb-1">No bookings yet</p>
          <p className="text-sm">New guest bookings will appear here.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-surface-800 divide-y divide-surface-800 overflow-hidden">
          {bookings.map((b) => (
            <div key={b.id} className="p-4 bg-surface-900 hover:bg-surface-900/80">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-white">{b.guest_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[b.status]}`}>{b.status}</span>
                    {b.source === 'embed_widget' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface-800 text-surface-500">via widget</span>
                    )}
                  </div>
                  <p className="text-sm text-surface-400 mt-1">
                    {b.pickup_text} &rarr; {b.dropoff_text}
                  </p>
                  <p className="text-xs text-surface-500 mt-1">
                    {format(new Date(b.pickup_ts), 'EEE, MMM d · HH:mm')} · {b.passenger_count} pax
                  </p>
                </div>
                <div className="text-right text-white">
                  <p className="font-semibold">€{b.quoted_price_eur.toFixed(2)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuthRequired() {
  return (
    <div className="rounded-xl border border-surface-800 bg-surface-900 p-6">
      <h2 className="text-lg font-semibold mb-1">Sign in required</h2>
      <p className="text-sm text-surface-400">
        The concierge portal is for authorised hotel and agency staff. <Link href="/auth/login?next=/concierge" className="text-brand-400 underline">Sign in</Link> to continue.
      </p>
    </div>
  );
}

function NotAMember() {
  return (
    <div className="rounded-xl border border-surface-800 bg-surface-900 p-6 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-5 h-5 text-brand-400" />
        <h2 className="text-lg font-semibold">Interested in Dromos Concierge?</h2>
      </div>
      <p className="text-sm text-surface-400">
        Your account isn&apos;t linked to a tenant yet. The portal is currently
        onboarding partner hotels and travel agencies across Cyprus. Reach out
        at <a href="mailto:partners@dromos.cy" className="text-brand-400 underline">partners@dromos.cy</a> to start.
      </p>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">
      Something went wrong: {msg}
    </div>
  );
}
