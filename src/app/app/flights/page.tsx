'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { ArrowLeft, Plane, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import type { FlightWatch } from '@/types/database';

export default function FlightsPage() {
  const supabase = createClient();
  const [flights, setFlights] = useState<FlightWatch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [flightNumber, setFlightNumber] = useState('');
  const [flightDate, setFlightDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadFlights();
  }, []);

  async function loadFlights() {
    const { data } = await supabase
      .from('flight_watches')
      .select('*')
      .order('flight_date', { ascending: true });
    setFlights(data || []);
  }

  async function handleTrackFlight(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/flights/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flight_number: flightNumber, flight_date: flightDate }),
      });

      const data = await res.json();

      if (res.ok) {
        setFlightNumber('');
        setFlightDate('');
        setShowForm(false);
        await loadFlights();
      } else {
        setError(data.error || 'Failed to track flight');
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  }

  async function handleDelete(id: string) {
    await supabase.from('flight_watches').delete().eq('id', id);
    setFlights(flights.filter((f) => f.id !== id));
  }

  const statusColors: Record<string, string> = {
    scheduled: 'text-blue-400 bg-blue-400/10',
    delayed: 'text-yellow-400 bg-yellow-400/10',
    landed: 'text-green-400 bg-green-400/10',
    cancelled: 'text-red-400 bg-red-400/10',
  };

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href="/app/airport" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Plane className="w-5 h-5 text-brand-400" />
        <h1 className="text-xl font-bold text-white flex-1">Flights</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="p-2 rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
        </button>
      </header>

      {showForm && (
        <form onSubmit={handleTrackFlight} className="p-4 border-b border-surface-800 space-y-3">
          <input
            type="text"
            placeholder="Flight number (e.g. A3 612)"
            value={flightNumber}
            onChange={(e) => setFlightNumber(e.target.value)}
            required
            className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            type="date"
            value={flightDate}
            onChange={(e) => setFlightDate(e.target.value)}
            required
            className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 rounded-xl px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Track Flight'}
          </button>
        </form>
      )}

      <div className="divide-y divide-surface-800">
        {flights.map((flight) => (
          <div key={flight.id} className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-surface-800 flex items-center justify-center">
              <Plane className="w-5 h-5 text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{flight.flight_number}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[flight.status] || 'text-surface-400 bg-surface-800'}`}>
                  {flight.status}
                </span>
              </div>
              <p className="text-sm text-surface-400">
                {flight.origin_airport} &rarr; {flight.destination_airport}
                {flight.airline && ` \u00B7 ${flight.airline}`}
              </p>
              <p className="text-xs text-surface-500">
                {format(new Date(flight.flight_date), 'EEE, MMM d, yyyy')}
                {flight.scheduled_arrival && ` \u00B7 ETA ${format(new Date(flight.scheduled_arrival), 'HH:mm')}`}
              </p>
            </div>
            <button
              onClick={() => handleDelete(flight.id)}
              className="p-2 text-surface-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        {flights.length === 0 && !showForm && (
          <div className="p-8 text-center text-surface-500">
            <Plane className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg mb-1">No flights tracked</p>
            <p className="text-sm">Track a flight to auto-coordinate rides from the airport</p>
          </div>
        )}
      </div>
    </div>
  );
}
