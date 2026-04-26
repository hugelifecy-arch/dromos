export const dynamic = 'force-dynamic';

// Admin tenant detail.
//
// Route: /admin/tenants/[id]
//
// Shows the tenant's identity + contact info, the current member roster
// with role + add/remove controls (delegated to a client component since
// the actions are interactive), and recent concierge bookings.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Building2, ExternalLink, Mail, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import TenantMembersClient from './TenantMembersClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminTenantDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const adminClient = createAdminClient();

  // Tenant row.
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, type, name, slug, district, contact_email, contact_phone, seat_count, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (!tenant) notFound();

  // Members + their profile info. Use admin client since tenant_members RLS
  // restricts non-members from reading the full roster.
  const { data: rawMembers } = await adminClient
    .from('tenant_members')
    .select('user_id, role, created_at')
    .eq('tenant_id', id)
    .order('created_at', { ascending: true });

  const memberIds = (rawMembers ?? []).map((m) => m.user_id);
  const profilesById = new Map<string, { full_name: string | null; email: string | null; avatar_url: string | null }>();
  if (memberIds.length > 0) {
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .in('id', memberIds);
    for (const p of profiles ?? []) {
      profilesById.set(p.id, p);
    }
  }
  const members = (rawMembers ?? []).map((m) => ({
    user_id: m.user_id,
    role: m.role as 'owner' | 'staff',
    created_at: m.created_at,
    profile: profilesById.get(m.user_id) ?? null,
  }));

  // Recent bookings (last 20).
  const { data: bookings } = await adminClient
    .from('concierge_bookings')
    .select('id, guest_name, pickup_district, dropoff_district, pickup_ts, quoted_price_eur, status, created_at')
    .eq('tenant_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/admin/tenants" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Building2 className="w-5 h-5 text-brand-400" />
        <h1 className="text-2xl font-bold text-white">{tenant.name}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          tenant.type === 'hotel'
            ? 'bg-blue-500/10 text-blue-400'
            : 'bg-purple-500/10 text-purple-400'
        }`}>
          {tenant.type}
        </span>
      </div>
      <p className="text-sm text-surface-500 mb-6 ml-9">
        Created {format(new Date(tenant.created_at), 'MMM d, yyyy')}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Identity card */}
        <div className="lg:col-span-1 bg-surface-900 border border-surface-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Identity</h2>
          <div className="text-sm space-y-2">
            <div>
              <p className="text-xs text-surface-500">Slug</p>
              <p className="text-surface-200 font-mono">{tenant.slug}</p>
            </div>
            <div>
              <p className="text-xs text-surface-500">District</p>
              <p className="text-surface-200 capitalize">{tenant.district}</p>
            </div>
            {tenant.seat_count != null && (
              <div>
                <p className="text-xs text-surface-500">Concierge seats</p>
                <p className="text-surface-200">{tenant.seat_count}</p>
              </div>
            )}
            {tenant.contact_email && (
              <div className="flex items-center gap-2 pt-1">
                <Mail className="w-3.5 h-3.5 text-surface-500" />
                <a href={`mailto:${tenant.contact_email}`} className="text-sm text-brand-400 hover:text-brand-300">
                  {tenant.contact_email}
                </a>
              </div>
            )}
            {tenant.contact_phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-surface-500" />
                <a href={`tel:${tenant.contact_phone}`} className="text-sm text-surface-300">
                  {tenant.contact_phone}
                </a>
              </div>
            )}
          </div>
          <div className="pt-3 border-t border-surface-800">
            <Link
              href={`/concierge/embed/${tenant.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300"
            >
              <ExternalLink className="w-3 h-3" />
              View embed widget
            </Link>
          </div>
        </div>

        {/* Members + bookings */}
        <div className="lg:col-span-2 space-y-6">
          <TenantMembersClient
            tenantId={tenant.id}
            initialMembers={members}
          />

          {/* Recent bookings */}
          <div className="bg-surface-900 border border-surface-800 rounded-2xl">
            <div className="p-4 border-b border-surface-800">
              <h2 className="text-sm font-semibold text-white">
                Recent bookings ({bookings?.length ?? 0})
              </h2>
            </div>
            {(!bookings || bookings.length === 0) && (
              <p className="px-4 py-8 text-center text-surface-500 text-sm">
                No bookings yet.
              </p>
            )}
            {bookings && bookings.length > 0 && (
              <ul className="divide-y divide-surface-800">
                {bookings.map((b) => (
                  <li key={b.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">
                        {b.guest_name}
                      </div>
                      <div className="text-xs text-surface-500 capitalize">
                        {b.pickup_district} → {b.dropoff_district}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-surface-200">€{Number(b.quoted_price_eur).toFixed(2)}</div>
                      <div className="text-[10px] text-surface-500">
                        {format(new Date(b.pickup_ts), 'MMM d, HH:mm')}
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0 ${
                      b.status === 'placed' ? 'bg-yellow-500/10 text-yellow-400' :
                      b.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400' :
                      b.status === 'cancelled' ? 'bg-red-500/10 text-red-400' :
                      'bg-surface-700 text-surface-300'
                    }`}>
                      {b.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
