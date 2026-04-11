'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { ArrowLeft, Bell, Save } from 'lucide-react';
import Link from 'next/link';

interface Preferences {
  push_enabled: boolean;
  email_enabled: boolean;
  new_leg_in_district: boolean;
  leg_claimed: boolean;
  leg_confirmed: boolean;
  new_message: boolean;
  counter_offer: boolean;
  departure_reminder: boolean;
  departure_reminder_minutes: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

const DEFAULT_PREFS: Preferences = {
  push_enabled: true,
  email_enabled: false,
  new_leg_in_district: true,
  leg_claimed: true,
  leg_confirmed: true,
  new_message: true,
  counter_offer: true,
  departure_reminder: true,
  departure_reminder_minutes: 60,
  quiet_hours_start: '',
  quiet_hours_end: '',
};

export default function NotificationPreferencesPage() {
  const supabase = createClient();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setPrefs({
          push_enabled: data.push_enabled ?? true,
          email_enabled: data.email_enabled ?? false,
          new_leg_in_district: data.new_leg_in_district ?? true,
          leg_claimed: data.leg_claimed ?? true,
          leg_confirmed: data.leg_confirmed ?? true,
          new_message: data.new_message ?? true,
          counter_offer: data.counter_offer ?? true,
          departure_reminder: data.departure_reminder ?? true,
          departure_reminder_minutes: data.departure_reminder_minutes ?? 60,
          quiet_hours_start: data.quiet_hours_start || '',
          quiet_hours_end: data.quiet_hours_end || '',
        });
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  async function handleSave() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: user.id,
        ...prefs,
        quiet_hours_start: prefs.quiet_hours_start || null,
        quiet_hours_end: prefs.quiet_hours_end || null,
      });

    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  function Toggle({ label, description, value, onChange }: {
    label: string;
    description?: string;
    value: boolean;
    onChange: (v: boolean) => void;
  }) {
    return (
      <div className="flex items-center justify-between py-3">
        <div>
          <p className="text-sm text-white">{label}</p>
          {description && <p className="text-xs text-surface-500 mt-0.5">{description}</p>}
        </div>
        <button
          onClick={() => onChange(!value)}
          className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-brand-600' : 'bg-surface-700'}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center text-surface-400">
        <p>Loading preferences...</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href="/app/notifications" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-white">Notification Preferences</h1>
      </header>

      <div className="p-4 space-y-6">
        {/* Delivery */}
        <section>
          <h2 className="text-sm font-medium text-surface-400 uppercase tracking-wider mb-2">Delivery</h2>
          <div className="bg-surface-900 rounded-xl p-4 divide-y divide-surface-800">
            <Toggle
              label="Push notifications"
              description="Get instant alerts on your device"
              value={prefs.push_enabled}
              onChange={(v) => setPrefs({ ...prefs, push_enabled: v })}
            />
            <Toggle
              label="Email notifications"
              description="Receive summaries by email"
              value={prefs.email_enabled}
              onChange={(v) => setPrefs({ ...prefs, email_enabled: v })}
            />
          </div>
        </section>

        {/* Events */}
        <section>
          <h2 className="text-sm font-medium text-surface-400 uppercase tracking-wider mb-2">Events</h2>
          <div className="bg-surface-900 rounded-xl p-4 divide-y divide-surface-800">
            <Toggle
              label="New legs in your district"
              description="When a new leg is posted near your area"
              value={prefs.new_leg_in_district}
              onChange={(v) => setPrefs({ ...prefs, new_leg_in_district: v })}
            />
            <Toggle
              label="Leg claimed"
              description="When someone claims your posted leg"
              value={prefs.leg_claimed}
              onChange={(v) => setPrefs({ ...prefs, leg_claimed: v })}
            />
            <Toggle
              label="Handoff confirmed"
              description="When a seller confirms your claim"
              value={prefs.leg_confirmed}
              onChange={(v) => setPrefs({ ...prefs, leg_confirmed: v })}
            />
            <Toggle
              label="New messages"
              value={prefs.new_message}
              onChange={(v) => setPrefs({ ...prefs, new_message: v })}
            />
            <Toggle
              label="Counter-offers"
              description="When someone proposes a different price"
              value={prefs.counter_offer}
              onChange={(v) => setPrefs({ ...prefs, counter_offer: v })}
            />
            <Toggle
              label="Departure reminders"
              value={prefs.departure_reminder}
              onChange={(v) => setPrefs({ ...prefs, departure_reminder: v })}
            />
          </div>
        </section>

        {/* Departure reminder time */}
        {prefs.departure_reminder && (
          <section>
            <h2 className="text-sm font-medium text-surface-400 uppercase tracking-wider mb-2">Reminder Lead Time</h2>
            <div className="bg-surface-900 rounded-xl p-4">
              <select
                value={prefs.departure_reminder_minutes}
                onChange={(e) => setPrefs({ ...prefs, departure_reminder_minutes: parseInt(e.target.value) })}
                className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value={15}>15 minutes before</option>
                <option value={30}>30 minutes before</option>
                <option value={60}>1 hour before</option>
                <option value={120}>2 hours before</option>
              </select>
            </div>
          </section>
        )}

        {/* Quiet hours */}
        <section>
          <h2 className="text-sm font-medium text-surface-400 uppercase tracking-wider mb-2">Quiet Hours</h2>
          <div className="bg-surface-900 rounded-xl p-4">
            <p className="text-xs text-surface-500 mb-3">Silence push notifications during these hours</p>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-surface-400 block mb-1">From</label>
                <input
                  type="time"
                  value={prefs.quiet_hours_start}
                  onChange={(e) => setPrefs({ ...prefs, quiet_hours_start: e.target.value })}
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-surface-400 block mb-1">To</label>
                <input
                  type="time"
                  value={prefs.quiet_hours_end}
                  onChange={(e) => setPrefs({ ...prefs, quiet_hours_end: e.target.value })}
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? 'Saving...' : saved ? (
            <>
              <Bell className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Preferences
            </>
          )}
        </button>
      </div>
    </div>
  );
}
