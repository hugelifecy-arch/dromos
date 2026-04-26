export const dynamic = 'force-dynamic';

// Admin tenants listing.
//
// Route: /admin/tenants
//
// Shows every hotel / agency tenant in the system with a member count and
// quick links to: the embed widget URL, the concierge portal entry point,
// and the create-new form. Authoritative source for the founder when
// onboarding new hotel partners.

import Link from 'next/link';
import { Building2, Plus, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase-server';

interface TenantRow {
  id: string;
  type: 'hotel' | 'agency';
  name: string;
  slug: string;
  district: string;
  contact_email: string | null;
  contact_phone: string | null;
  seat_count: number | null;
  created_at: string;
  member_count: number;
  booking_count: number;
}

export default async function AdminTenantsPage() {
  const supabase = await createClient();

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, type, name, slug, district, contact_email, contact_phone, seat_count, created_at')
    .order('created_at', { ascending: false });

  // Member counts + booking counts per tenant. Done via a single fetch
  // each (small N here; doesn't warrant an RPC).
  const ids = (tenants ?? []).map((t) => t.id);
  let memberCounts: Record<string, number> = {};
  let bookingCounts: Record<string, number> = {};

  if (ids.length > 0) {
    const { data: members } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .in('tenant_id', ids);
    memberCounts = (members ?? []).reduce<Record<string, number>>((acc, m) => {
      acc[m.tenant_id] = (acc[m.tenant_id] ?? 0) + 1;
      return acc;
    }, {});

    const { data: bookings } = await supabase
      .from('concierge_bookings')
      .select('tenant_id')
      .in('tenant_id', ids);
    bookingCounts = (bookings ?? []).reduce<Record<string, number>>((acc, b) => {
      acc[b.tenant_id] = (acc[b.tenant_id] ?? 0) + 1;
      return acc;
    }, {});
  }

  const rows: TenantRow[] = (tenants ?? []).map((t) => ({
    ...t,
    member_count: memberCounts[t.id] ?? 0,
    booking_count: bookingCounts[t.id] ?? 0,
  })) as TenantRow[];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tenants</h1>
          <p className="text-sm text-surface-400 mt-1">
            Hotel + agency partners that book empty legs on behalf of guests.
          </p>
        </div>
        <Link
          href="/admin/tenants/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New tenant
        </Link>
      </div>

      <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
        {rows.length === 0 && (
          <div className="px-6 py-12 text-center text-surface-400 text-sm">
            <Building2 className="w-10 h-10 mx-auto text-surface-600 mb-3" />
            <p className="text-surface-300 font-medium mb-1">No tenants yet.</p>
            <p>Create the first hotel partner to start testing the concierge flow.</p>
          </div>
        )}

        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-surface-500 uppercase tracking-wider border-b border-surface-800">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">District</th>
                <th className="px-4 py-3">Seats</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Bookings</th>
                <th className="px-4 py-3">Embed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {rows.map((t) => (
                <tr key={t.id} className="hover:bg-surface-800/40">
                  <td className="px-4 py-3">
                    <Link href={`/admin/tenants/${t.id}`} className="block">
                      <div className="text-white font-medium hover:text-brand-300 transition-colors">{t.name}</div>
                      {t.contact_email && (
                        <div className="text-xs text-surface-500">{t.contact_email}</div>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      t.type === 'hotel'
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'bg-purple-500/10 text-purple-400'
                    }`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-surface-300 capitalize">{t.district}</td>
                  <td className="px-4 py-3 text-surface-300">{t.seat_count ?? '—'}</td>
                  <td className="px-4 py-3 text-surface-300">{t.member_count}</td>
                  <td className="px-4 py-3 text-surface-300">{t.booking_count}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/concierge/embed/${t.slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
                    >
                      <ExternalLink className="w-3 h-3" />
                      /{t.slug}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
