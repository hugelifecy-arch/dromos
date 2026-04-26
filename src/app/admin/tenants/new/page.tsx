'use client';

// Admin: create a new tenant.
//
// Route: /admin/tenants/new
//
// Two paths after creation:
//   * "Create tenant only" — just the tenant row. Owner membership added
//     manually later (member-management UI is a follow-up).
//   * "Create and become owner" — creates the tenant AND assigns the
//     creating admin as the owner via tenant_members. Useful for the
//     founder to preview the concierge portal end-to-end without
//     impersonating a hotel staff account.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, AlertCircle } from 'lucide-react';
import { LICENCE_DISTRICTS } from '@/lib/constants/locations';

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export default function NewTenantPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    type: 'hotel' as 'hotel' | 'agency',
    slug: '',
    district: 'limassol' as typeof LICENCE_DISTRICTS[number],
    contact_email: '',
    contact_phone: '',
    seat_count: '' as string,
    assign_self_as_owner: true,
  });

  function autoSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip diacritics
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function validate(): string | null {
    if (!form.name.trim()) return 'Name is required.';
    if (form.name.trim().length < 2) return 'Name is too short.';
    if (!form.slug.trim()) return 'Slug is required.';
    if (form.slug.length < 2 || form.slug.length > 64) return 'Slug must be 2-64 characters.';
    if (!SLUG_REGEX.test(form.slug)) {
      return 'Slug: lowercase letters, digits, hyphens only (e.g. hotel-aphrodite).';
    }
    if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) {
      return 'Contact email looks invalid.';
    }
    if (form.seat_count && (Number(form.seat_count) < 1 || Number(form.seat_count) > 1000)) {
      return 'Seat count out of range (1-1000).';
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
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          slug: form.slug.trim(),
          district: form.district,
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          seat_count: form.seat_count ? Number(form.seat_count) : null,
          assign_self_as_owner: form.assign_self_as_owner,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to create tenant');
      router.push('/admin/tenants');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setSubmitting(false);
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/tenants" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Building2 className="w-5 h-5 text-brand-400" />
        <h1 className="text-2xl font-bold text-white">New tenant</h1>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 mb-6 text-sm text-red-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={submit} className="bg-surface-900 border border-surface-800 rounded-2xl p-6 space-y-5">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-white">Identity</h2>

          <div>
            <label className="block text-xs text-surface-400 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({
                  ...f,
                  name,
                  slug: f.slug || autoSlug(name),
                }));
              }}
              placeholder="Hotel Aphrodite"
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-surface-400 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as 'hotel' | 'agency' })}
                className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-white text-sm capitalize"
              >
                <option value="hotel">Hotel</option>
                <option value="agency">Agency</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">District</label>
              <select
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value as typeof form.district })}
                className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-white text-sm capitalize"
              >
                {LICENCE_DISTRICTS.map((d) => (
                  <option key={d} value={d} className="capitalize">{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-surface-400 mb-1">Slug (URL key for embed widget)</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
              placeholder="hotel-aphrodite"
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none text-sm font-mono"
              required
            />
            <p className="text-[11px] text-surface-500 mt-1">
              Will be live at <span className="font-mono">/concierge/embed/{form.slug || 'your-slug'}</span>. Stable once issued.
            </p>
          </div>
        </section>

        <section className="space-y-3 pt-2 border-t border-surface-800">
          <h2 className="text-sm font-semibold text-white">Contact (optional)</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-surface-400 mb-1">Email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                placeholder="concierge@aphrodite.cy"
                className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">Phone</label>
              <input
                type="tel"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                placeholder="+357 25 123 456"
                className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-surface-400 mb-1">Concierge desk seats</label>
            <input
              type="number"
              value={form.seat_count}
              onChange={(e) => setForm({ ...form, seat_count: e.target.value })}
              placeholder="e.g. 3"
              min={1}
              max={1000}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none text-sm"
            />
            <p className="text-[11px] text-surface-500 mt-1">
              Number of staff seats the tenant has paid for (informational; doesn&apos;t gate access yet).
            </p>
          </div>
        </section>

        <section className="space-y-3 pt-2 border-t border-surface-800">
          <label className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-surface-800 border border-surface-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.assign_self_as_owner}
              onChange={(e) => setForm({ ...form, assign_self_as_owner: e.target.checked })}
              className="w-4 h-4 mt-0.5 rounded bg-surface-700 border-surface-600 text-brand-500 focus:ring-brand-500"
            />
            <div className="text-sm">
              <p className="text-surface-200 font-medium">Add me as the owner</p>
              <p className="text-xs text-surface-500">
                Required to preview the concierge portal yourself. Untick if onboarding for someone else.
              </p>
            </div>
          </label>
        </section>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-surface-800 disabled:text-surface-500 text-white text-sm font-medium transition-colors"
          >
            {submitting ? 'Creating…' : 'Create tenant'}
          </button>
          <Link
            href="/admin/tenants"
            className="px-6 py-2.5 rounded-xl text-surface-400 hover:text-white text-sm transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
