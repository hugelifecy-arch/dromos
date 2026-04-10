'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { ArrowLeft, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';

export default function PostPage() {
  const router = useRouter();
  const supabase = createClient();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'post' | 'ride'>('post');

  // Ride form state
  const [rideForm, setRideForm] = useState({
    origin_address: '',
    destination_address: '',
    departure_time: '',
    seats_total: 3,
    price_per_seat: '',
    notes: '',
  });

  async function handlePost() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('feed_posts').insert({
      author_id: user.id,
      content,
    });

    router.push('/app/feed');
  }

  async function handleRide(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('rides').insert({
      driver_id: user.id,
      origin_address: rideForm.origin_address,
      origin_lat: 37.9838,
      origin_lng: 23.7275,
      destination_address: rideForm.destination_address,
      destination_lat: 40.6401,
      destination_lng: 22.9444,
      departure_time: new Date(rideForm.departure_time).toISOString(),
      seats_total: rideForm.seats_total,
      seats_available: rideForm.seats_total,
      price_per_seat: parseFloat(rideForm.price_per_seat),
      notes: rideForm.notes || null,
      currency: 'EUR',
      is_recurring: false,
      recurrence_days: [],
      allow_detours: false,
      max_detour_minutes: 15,
      luggage_size: 'medium',
    });

    if (!error) router.push('/app/feed');
    setLoading(false);
  }

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href="/app/feed" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-white">Create</h1>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-surface-800">
        <button
          onClick={() => setTab('post')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'post' ? 'text-white border-b-2 border-brand-500' : 'text-surface-500'}`}
        >
          Feed Post
        </button>
        <button
          onClick={() => setTab('ride')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'ride' ? 'text-white border-b-2 border-brand-500' : 'text-surface-500'}`}
        >
          Offer a Ride
        </button>
      </div>

      {tab === 'post' ? (
        <div className="p-4 space-y-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            rows={5}
            className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
          <div className="flex items-center justify-between">
            <button className="p-2 text-surface-500 hover:text-brand-400 transition-colors">
              <ImageIcon className="w-5 h-5" />
            </button>
            <button
              onClick={handlePost}
              disabled={!content.trim() || loading}
              className="bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleRide} className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-surface-400 mb-1">From</label>
            <input
              type="text"
              required
              value={rideForm.origin_address}
              onChange={(e) => setRideForm({ ...rideForm, origin_address: e.target.value })}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. Athens, Syntagma"
            />
          </div>
          <div>
            <label className="block text-sm text-surface-400 mb-1">To</label>
            <input
              type="text"
              required
              value={rideForm.destination_address}
              onChange={(e) => setRideForm({ ...rideForm, destination_address: e.target.value })}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. Thessaloniki, Center"
            />
          </div>
          <div>
            <label className="block text-sm text-surface-400 mb-1">Departure</label>
            <input
              type="datetime-local"
              required
              value={rideForm.departure_time}
              onChange={(e) => setRideForm({ ...rideForm, departure_time: e.target.value })}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-surface-400 mb-1">Seats</label>
              <select
                value={rideForm.seats_total}
                onChange={(e) => setRideForm({ ...rideForm, seats_total: parseInt(e.target.value) })}
                className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-surface-400 mb-1">Price per seat</label>
              <input
                type="number"
                required
                min="2"
                step="0.50"
                value={rideForm.price_per_seat}
                onChange={(e) => setRideForm({ ...rideForm, price_per_seat: e.target.value })}
                className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="EUR"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-surface-400 mb-1">Notes (optional)</label>
            <textarea
              value={rideForm.notes}
              onChange={(e) => setRideForm({ ...rideForm, notes: e.target.value })}
              rows={2}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Any extra details..."
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'Publishing...' : 'Publish Ride'}
          </button>
        </form>
      )}
    </div>
  );
}
