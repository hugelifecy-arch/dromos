'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { ArrowLeft, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import type { EmptyLeg } from '@/lib/types/empty-leg';

export default function PostPage() {
  const router = useRouter();
  const supabase = createClient();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'post' | 'leg'>('post');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Empty leg form state
  const [legForm, setLegForm] = useState({
    origin: '',
    destination: '',
    leg_type: 'standard' as const,
    departure_datetime: '',
    is_time_flexible: false,
    passenger_capacity: 1,
    luggage_capacity: 'medium' as const,
    asking_price: '',
    has_passenger: false,
    passenger_count: '',
    passenger_name: '',
    passenger_phone: '',
    special_requirements: '',
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

  async function handleLeg(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    setLoading(true);

    // Validation
    if (legForm.origin.trim() === legForm.destination.trim()) {
      setValidationError('Origin and destination cannot be the same');
      setLoading(false);
      return;
    }

    const departure = new Date(legForm.departure_datetime);
    const now = new Date();
    const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
    if (departure < thirtyMinutesFromNow && !legForm.is_time_flexible) {
      setValidationError('Departure time must be at least 30 minutes in the future');
      setLoading(false);
      return;
    }

    const askingPrice = parseFloat(legForm.asking_price);
    if (isNaN(askingPrice) || askingPrice <= 0) {
      setValidationError('Asking price must be greater than 0');
      setLoading(false);
      return;
    }

    if (legForm.has_passenger && !legForm.passenger_count) {
      setValidationError('Passenger count is required when "I already have a passenger" is selected');
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Prepare leg data
    const legData: Partial<EmptyLeg> = {
      seller_id: user.id,
      origin: legForm.origin,
      destination: legForm.destination,
      leg_type: legForm.leg_type,
      departure_datetime: new Date(legForm.departure_datetime).toISOString(),
      is_time_flexible: legForm.is_time_flexible,
      passenger_capacity: Number(legForm.passenger_capacity),
      luggage_capacity: legForm.luggage_capacity,
      asking_price: askingPrice,
      currency: 'EUR',
      has_passenger: legForm.has_passenger,
      passenger_count: legForm.has_passenger ? Number(legForm.passenger_count) : null,
      passenger_name: legForm.has_passenger && legForm.passenger_name ? legForm.passenger_name : null,
      passenger_phone: legForm.has_passenger && legForm.passenger_phone ? legForm.passenger_phone : null,
      special_requirements: legForm.has_passenger && legForm.special_requirements ? legForm.special_requirements : null,
      notes: legForm.notes || null,
      status: 'open',
    };

    const { error } = await supabase.from('empty_legs').insert(legData);

    if (!error) {
      router.push('/app/feed');
    } else {
      setValidationError('Failed to create empty leg. Please try again.');
    }
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
          onClick={() => setTab('leg')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'leg' ? 'text-white border-b-2 border-brand-500' : 'text-surface-500'}`}
        >
          Post a Leg
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
        <form onSubmit={handleLeg} className="p-4 space-y-4">
          {validationError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
              {validationError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Origin <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={legForm.origin}
              onChange={(e) => setLegForm({ ...legForm, origin: e.target.value })}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. Larnaca Airport (LCA)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Destination <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={legForm.destination}
              onChange={(e) => setLegForm({ ...legForm, destination: e.target.value })}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. Limassol, Old Port"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Leg Type <span className="text-red-400">*</span>
            </label>
            <select
              value={legForm.leg_type}
              onChange={(e) => setLegForm({ ...legForm, leg_type: e.target.value as any })}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="standard">Standard</option>
              <option value="airport_inbound">Airport Inbound</option>
              <option value="airport_outbound">Airport Outbound</option>
              <option value="long_distance">Long Distance</option>
              <option value="repositioning">Repositioning Only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Departure <span className="text-red-400">*</span>
            </label>
            <div className="space-y-2">
              <input
                type="datetime-local"
                required
                value={legForm.departure_datetime}
                onChange={(e) => setLegForm({ ...legForm, departure_datetime: e.target.value })}
                className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={legForm.is_time_flexible}
                  onChange={(e) => setLegForm({ ...legForm, is_time_flexible: e.target.checked })}
                  className="w-4 h-4 bg-surface-800 border border-surface-700 rounded accent-brand-500"
                />
                <span className="text-sm text-surface-400">Flexible time (date only)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Seats Available <span className="text-red-400">*</span>
            </label>
            <p className="text-xs text-surface-400 mb-2">How many passengers can you take?</p>
            <select
              value={legForm.passenger_capacity}
              onChange={(e) => setLegForm({ ...legForm, passenger_capacity: parseInt(e.target.value) })}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} seat{n !== 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Luggage Capacity <span className="text-red-400">*</span>
            </label>
            <select
              value={legForm.luggage_capacity}
              onChange={(e) => setLegForm({ ...legForm, luggage_capacity: e.target.value as any })}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="none">None</option>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Asking Price (EUR) <span className="text-red-400">*</span>
            </label>
            <p className="text-xs text-surface-400 mb-2">Set your price. Buyers see this and decide to claim. You keep what you charge.</p>
            <input
              type="number"
              required
              min="1"
              step="0.50"
              value={legForm.asking_price}
              onChange={(e) => setLegForm({ ...legForm, asking_price: e.target.value })}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={legForm.has_passenger}
                  onChange={(e) => setLegForm({ ...legForm, has_passenger: e.target.checked })}
                  className="w-4 h-4 bg-surface-800 border border-surface-700 rounded accent-brand-500"
                />
              </div>
              <span className="text-sm font-medium text-white">I already have a passenger</span>
            </label>
          </div>

          {legForm.has_passenger && (
            <div className="space-y-4 bg-surface-800/50 border border-surface-700 rounded-xl p-4">
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Passenger Count <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={legForm.passenger_count}
                  onChange={(e) => setLegForm({ ...legForm, passenger_count: e.target.value })}
                  className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Number of passengers"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">Passenger Name</label>
                <input
                  type="text"
                  value={legForm.passenger_name}
                  onChange={(e) => setLegForm({ ...legForm, passenger_name: e.target.value })}
                  className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">Passenger Phone</label>
                <input
                  type="tel"
                  value={legForm.passenger_phone}
                  onChange={(e) => setLegForm({ ...legForm, passenger_phone: e.target.value })}
                  className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">Special Requirements</label>
                <textarea
                  value={legForm.special_requirements}
                  onChange={(e) => setLegForm({ ...legForm, special_requirements: e.target.value })}
                  rows={2}
                  className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder="e.g. wheelchair accessible, pet-friendly, etc."
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-white mb-1">Notes</label>
            <textarea
              value={legForm.notes}
              onChange={(e) => setLegForm({ ...legForm, notes: e.target.value })}
              rows={2}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Any additional details..."
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'Publishing...' : 'Post a Leg'}
          </button>
        </form>
      )}
    </div>
  );
}
