'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { APP_NAME } from '@/lib/constants';

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    bio: '',
    is_driver: false,
    car_make: '',
    car_model: '',
    car_color: '',
    car_plate: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const updates: Record<string, unknown> = {
      full_name: form.full_name,
      phone: form.phone,
      bio: form.bio,
      is_driver: form.is_driver,
    };

    if (form.is_driver) {
      updates.car_make = form.car_make;
      updates.car_model = form.car_model;
      updates.car_color = form.car_color;
      updates.car_plate = form.car_plate;
    }

    await supabase.from('profiles').update(updates).eq('id', user.id);

    // Create free subscription record
    await supabase.from('subscriptions').insert({ user_id: user.id, tier: 'free' });

    router.push('/app/feed');
  }

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-white text-center mb-2">{APP_NAME}</h1>
        <p className="text-surface-400 text-center mb-8">Complete your profile to get started</p>

        <form onSubmit={handleSubmit} className="bg-surface-900 rounded-2xl p-6 border border-surface-800 space-y-4">
          <div>
            <label className="block text-sm text-surface-400 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="block text-sm text-surface-400 mb-1">Phone Number</label>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="+30 6xx xxx xxxx"
            />
          </div>

          <div>
            <label className="block text-sm text-surface-400 mb-1">Short Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={2}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Tell us a bit about yourself"
            />
          </div>

          <label className="flex items-center gap-3 p-3 bg-surface-800 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_driver}
              onChange={(e) => setForm({ ...form, is_driver: e.target.checked })}
              className="w-5 h-5 rounded bg-surface-700 border-surface-600 text-brand-500 focus:ring-brand-500"
            />
            <div>
              <p className="text-white font-medium">I&apos;m a licensed Cyprus taxi driver</p>
              <p className="text-surface-400 text-sm">Add your vehicle below; submit your licence on the next step.</p>
            </div>
          </label>

          {form.is_driver && (
            <div className="space-y-3 pt-2 border-t border-surface-800">
              <p className="text-sm text-surface-400 font-medium">Vehicle Details</p>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={form.car_make}
                  onChange={(e) => setForm({ ...form, car_make: e.target.value })}
                  className="bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Make (e.g. Toyota)"
                />
                <input
                  type="text"
                  value={form.car_model}
                  onChange={(e) => setForm({ ...form, car_model: e.target.value })}
                  className="bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Model (e.g. Yaris)"
                />
                <input
                  type="text"
                  value={form.car_color}
                  onChange={(e) => setForm({ ...form, car_color: e.target.value })}
                  className="bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Color"
                />
                <input
                  type="text"
                  value={form.car_plate}
                  onChange={(e) => setForm({ ...form, car_plate: e.target.value })}
                  className="bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Plate (e.g. ABC-1234)"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50 mt-2"
          >
            {loading ? 'Saving...' : 'Get Started'}
          </button>
        </form>
      </div>
    </div>
  );
}
