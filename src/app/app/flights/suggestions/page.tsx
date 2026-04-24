'use client';

// Driver-facing inbox of flight-match suggestions.
//
// Route: /app/flights/suggestions
//
// Each row describes an inbound arrival that plausibly feeds one of the
// driver's open legs, plus a one-tap accept/reject. Accept marks the
// suggestion taken (leg stays as-is for now; editing pricing is a follow-up).
// Reject permanently dismisses — the cron won't resurrect it.
//
// Feature flag: the endpoint still loads when FLIGHT_MATCH_ENABLED=false, it
// just never has anything to show. We keep a small empty-state copy pointing
// at that.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Plane, Check, X, Clock } from 'lucide-react';

interface SuggestionRow {
  id: string;
  leg_id: string;
  score: number;
  reason: string | null;
  suggested_price_eur: number | null;
  pricing_ceiling_eur: number | null;
  created_at: string;
  tracked_flights: {
    flight_number: string;
    airport: 'LCA' | 'PFO';
    scheduled_arrival: string;
    estimated_arrival: string | null;
    origin_iata: string | null;
    airline: string | null;
    status: string | null;
  };
  empty_legs: {
    origin: string;
    destination: string;
    departure_datetime: string;
    asking_price: number;
    passenger_capacity: number;
    status: string;
  };
}

export default function FlightSuggestionsPage() {
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/flight-matches');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load');
      setRows(body.matches as SuggestionRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setLoading(false);
  }

  async function resolve(id: string, action: 'accept' | 'reject') {
    setBusyId(id);
    try {
      const res = await fetch('/api/flight-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || `Failed to ${action}`);
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setBusyId(null);
  }

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href="/app/flights" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Plane className="w-5 h-5 text-brand-400" />
        <h1 className="text-xl font-bold text-white flex-1">Flight suggestions</h1>
      </header>

      {error && (
        <div className="m-4 text-sm text-red-400 bg-red-400/10 rounded-xl px-4 py-3">{error}</div>
      )}

      {loading && (
        <div className="p-8 text-center text-surface-500 text-sm">Loading…</div>
      )}

      {!loading && rows.length === 0 && (
        <div className="p-8 text-center text-surface-500">
          <Plane className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg mb-1 text-white">No suggestions yet</p>
          <p className="text-sm">
            When an inbound flight to LCA or PFO matches one of your open legs,
            we&apos;ll drop it here so you can take it with one tap.
          </p>
        </div>
      )}

      <div className="divide-y divide-surface-800">
        {rows.map((row) => (
          <SuggestionCard
            key={row.id}
            row={row}
            busy={busyId === row.id}
            onAccept={() => resolve(row.id, 'accept')}
            onReject={() => resolve(row.id, 'reject')}
          />
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({
  row,
  busy,
  onAccept,
  onReject,
}: {
  row: SuggestionRow;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const etaIso = row.tracked_flights.estimated_arrival ?? row.tracked_flights.scheduled_arrival;
  const eta = new Date(etaIso);
  const dep = new Date(row.empty_legs.departure_datetime);
  const offsetMin = Math.round((dep.getTime() - eta.getTime()) / 60_000);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-800 flex items-center justify-center flex-shrink-0">
          <Plane className="w-5 h-5 text-brand-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-medium">
              {row.tracked_flights.flight_number}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-400/10 text-brand-300">
              {Math.round(row.score * 100)}% match
            </span>
            {row.tracked_flights.status && (
              <span className="text-xs text-surface-500">{row.tracked_flights.status}</span>
            )}
          </div>
          <p className="text-sm text-surface-400 mt-0.5">
            {row.tracked_flights.origin_iata ?? '—'} &rarr; {row.tracked_flights.airport}
            {row.tracked_flights.airline && ` · ${row.tracked_flights.airline}`}
          </p>
          <p className="text-xs text-surface-500 flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" />
            ETA {format(eta, 'EEE HH:mm')}
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-surface-900 border border-surface-800 p-3 text-sm">
        <p className="text-white">
          {row.empty_legs.origin} &rarr; {row.empty_legs.destination}
        </p>
        <p className="text-xs text-surface-400 mt-1">
          Departs {format(dep, 'HH:mm')} ({offsetMin} min after landing) · {row.empty_legs.passenger_capacity} seats
        </p>
        <p className="text-xs text-surface-400 mt-1">
          Current asking €{row.empty_legs.asking_price.toFixed(2)}
          {row.suggested_price_eur != null && (
            <> · suggested €{row.suggested_price_eur.toFixed(2)}</>
          )}
          {row.pricing_ceiling_eur != null && (
            <span className="text-surface-600"> · ceiling €{row.pricing_ceiling_eur.toFixed(2)}</span>
          )}
        </p>
        {row.reason && (
          <p className="text-xs text-surface-500 mt-2 italic">{row.reason}</p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onAccept}
          disabled={busy}
          className="flex-1 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
          Take it
        </button>
        <button
          onClick={onReject}
          disabled={busy}
          className="flex-1 bg-surface-800 hover:bg-surface-700 text-surface-300 text-sm font-medium py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <X className="w-4 h-4" />
          Dismiss
        </button>
      </div>
    </div>
  );
}
