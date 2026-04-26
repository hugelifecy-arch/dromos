'use client';

// Driver-verification submission flow.
//
// Route: /app/profile/verification
//
// Drivers submit their Cyprus taxi licence + vehicle details for admin
// review. Status flows: pending -> approved | rejected.
//
// Photo upload is intentionally deferred for v1: Supabase Storage buckets
// + signed-URL plumbing is its own sprint. Drivers email scans of their
// licence to a contact address listed on the form; admins attach the URLs
// later via the verifications panel. This keeps the data model honest
// (the columns exist) without blocking the submission flow on infra
// that hasn't landed yet.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, ShieldAlert, Clock, AlertCircle } from 'lucide-react';
import { LICENCE_DISTRICTS, TAXI_TYPES, CYPRUS_PLATE_REGEX } from '@/lib/constants/locations';

type Status = 'none' | 'pending' | 'approved' | 'rejected';

interface ExistingVerification {
  id: string;
  verification_status: Status;
  rejection_reason: string | null;
  verified_at: string | null;
  licence_district: string;
  taxi_type: string;
  vehicle_plate: string;
}

export default function DriverVerificationPage() {
  const router = useRouter();

  const [existing, setExisting] = useState<ExistingVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    licence_number: '',
    licence_district: 'larnaca' as typeof LICENCE_DISTRICTS[number],
    taxi_type: 'urban' as typeof TAXI_TYPES[number],
    vehicle_plate: '',
    vehicle_make: '',
    vehicle_model: '',
    vehicle_year: '',
    vehicle_colour: '',
    vehicle_seats: 4,
    wheelchair_accessible: false,
    language_preference: 'el' as 'en' | 'el' | 'tr',
  });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/driver-verification');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load');
      if (body.verification) setExisting(body.verification as ExistingVerification);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setLoading(false);
  }

  function validate(): string | null {
    if (!form.licence_number.trim()) return 'Licence number is required.';
    if (form.licence_number.trim().length < 4) return 'Licence number looks too short.';
    if (!form.vehicle_plate.trim()) return 'Vehicle plate is required.';
    const plate = form.vehicle_plate.trim().toUpperCase();
    if (!CYPRUS_PLATE_REGEX.test(plate.replace(/\s/g, ''))) {
      return 'Plate format expected: 2–3 letters + 3 digits (e.g. ABC123).';
    }
    if (form.vehicle_seats < 1 || form.vehicle_seats > 8) {
      return 'Vehicle seats must be between 1 and 8.';
    }
    if (form.vehicle_year && (Number(form.vehicle_year) < 1980 || Number(form.vehicle_year) > new Date().getFullYear() + 1)) {
      return 'Vehicle year looks wrong.';
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/driver-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licence_number: form.licence_number.trim(),
          licence_district: form.licence_district,
          taxi_type: form.taxi_type,
          vehicle_plate: form.vehicle_plate.trim().toUpperCase().replace(/\s/g, ''),
          vehicle_make: form.vehicle_make.trim() || null,
          vehicle_model: form.vehicle_model.trim() || null,
          vehicle_year: form.vehicle_year ? Number(form.vehicle_year) : null,
          vehicle_colour: form.vehicle_colour.trim() || null,
          vehicle_seats: form.vehicle_seats,
          wheelchair_accessible: form.wheelchair_accessible,
          language_preference: form.language_preference,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Submission failed');
      // Land back on the profile page so the user sees the new status badge.
      router.push('/app/profile');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href="/app/profile" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <ShieldCheck className="w-5 h-5 text-brand-400" />
        <h1 className="text-xl font-bold text-white flex-1">Driver verification</h1>
      </header>

      <main className="px-4 py-6 space-y-6">
        {loading && <p className="text-surface-500 text-sm">Loading…</p>}

        {!loading && existing && existing.verification_status === 'pending' && (
          <div className="rounded-xl border border-yellow-900/50 bg-yellow-950/30 p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-100 space-y-1">
              <p className="font-semibold">Submission received — under review.</p>
              <p>An admin will approve or reject within 1–2 business days. You&apos;ll get a notification when the decision lands.</p>
              <p className="text-xs text-yellow-200/70 pt-1">
                Email scans of your licence (front + back) to <span className="underline">verify@dromos.cy</span> if you haven&apos;t already.
              </p>
            </div>
          </div>
        )}

        {!loading && existing && existing.verification_status === 'approved' && (
          <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 p-4 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-100">
              <p className="font-semibold">Verified.</p>
              <p>You can post legs, claim others&apos;, and receive handoffs from trusted colleagues.</p>
            </div>
          </div>
        )}

        {!loading && existing && existing.verification_status === 'rejected' && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-100 space-y-1">
              <p className="font-semibold">Submission rejected.</p>
              {existing.rejection_reason && (
                <p className="text-red-200">Reason: {existing.rejection_reason}</p>
              )}
              <p className="text-xs text-red-200/70 pt-1">
                Resubmitting is currently a manual process — email <span className="underline">verify@dromos.cy</span> for next steps.
              </p>
            </div>
          </div>
        )}

        {!loading && !existing && (
          <>
            <p className="text-surface-300 text-sm">
              Submit your Cyprus taxi licence + vehicle details. Once approved, you can post empty legs, accept handoffs from colleagues, and earn from the platform.
            </p>

            {error && (
              <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={submit} className="space-y-5">
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-white">Licence</h2>

                <div>
                  <label className="block text-xs text-surface-400 mb-1">Licence number</label>
                  <input
                    type="text"
                    value={form.licence_number}
                    onChange={(e) => setForm({ ...form, licence_number: e.target.value })}
                    placeholder="As shown on your taxi licence"
                    className="w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none text-sm"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-surface-400 mb-1">District</label>
                    <select
                      value={form.licence_district}
                      onChange={(e) => setForm({ ...form, licence_district: e.target.value as typeof form.licence_district })}
                      className="w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-white text-sm capitalize"
                    >
                      {LICENCE_DISTRICTS.map((d) => (
                        <option key={d} value={d} className="capitalize">{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-surface-400 mb-1">Taxi type</label>
                    <select
                      value={form.taxi_type}
                      onChange={(e) => setForm({ ...form, taxi_type: e.target.value as typeof form.taxi_type })}
                      className="w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-white text-sm capitalize"
                    >
                      {TAXI_TYPES.map((t) => (
                        <option key={t} value={t} className="capitalize">{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-white">Vehicle</h2>

                <div>
                  <label className="block text-xs text-surface-400 mb-1">Plate number</label>
                  <input
                    type="text"
                    value={form.vehicle_plate}
                    onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value.toUpperCase() })}
                    placeholder="ABC123"
                    className="w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none text-sm uppercase"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-surface-400 mb-1">Make</label>
                    <input
                      type="text"
                      value={form.vehicle_make}
                      onChange={(e) => setForm({ ...form, vehicle_make: e.target.value })}
                      placeholder="Toyota"
                      className="w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-surface-400 mb-1">Model</label>
                    <input
                      type="text"
                      value={form.vehicle_model}
                      onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })}
                      placeholder="Corolla"
                      className="w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-surface-400 mb-1">Year</label>
                    <input
                      type="number"
                      value={form.vehicle_year}
                      onChange={(e) => setForm({ ...form, vehicle_year: e.target.value })}
                      placeholder="2018"
                      min={1980}
                      max={new Date().getFullYear() + 1}
                      className="w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-surface-400 mb-1">Colour</label>
                    <input
                      type="text"
                      value={form.vehicle_colour}
                      onChange={(e) => setForm({ ...form, vehicle_colour: e.target.value })}
                      placeholder="White"
                      className="w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-surface-400 mb-1">Seats</label>
                    <input
                      type="number"
                      value={form.vehicle_seats}
                      onChange={(e) => setForm({ ...form, vehicle_seats: Number(e.target.value) })}
                      min={1}
                      max={8}
                      className="w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-white text-sm"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-900 border border-surface-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.wheelchair_accessible}
                    onChange={(e) => setForm({ ...form, wheelchair_accessible: e.target.checked })}
                    className="w-4 h-4 rounded bg-surface-800 border-surface-700 text-brand-500 focus:ring-brand-500"
                  />
                  <span className="text-sm text-surface-200">Wheelchair accessible</span>
                </label>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-white">Preferences</h2>
                <div>
                  <label className="block text-xs text-surface-400 mb-1">Language</label>
                  <select
                    value={form.language_preference}
                    onChange={(e) => setForm({ ...form, language_preference: e.target.value as typeof form.language_preference })}
                    className="w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-white text-sm"
                  >
                    <option value="el">Ελληνικά</option>
                    <option value="en">English</option>
                    <option value="tr">Türkçe</option>
                  </select>
                </div>
              </section>

              <div className="rounded-xl border border-surface-800 bg-surface-900 p-3 text-xs text-surface-400 space-y-1">
                <p className="text-surface-200 font-medium">Licence photos</p>
                <p>
                  After submitting, email a clear photo of the front + back of your licence to{' '}
                  <span className="text-surface-200 underline">verify@dromos.cy</span> with your registered email in the subject line. We&apos;ll attach them to your submission before review.
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-surface-800 disabled:text-surface-500 text-white font-medium transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit for verification'}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
