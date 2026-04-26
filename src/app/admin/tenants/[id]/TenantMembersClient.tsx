'use client';

// Tenant member-roster client component.
//
// Renders the current member list with role badges and remove buttons,
// plus an "add member" form (find by email + pick role). Hits
// /api/admin/tenants/[id]/members for the writes; the parent server
// component does the initial read.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Users, UserPlus, Trash2, AlertCircle, Crown, ShieldCheck } from 'lucide-react';

interface MemberRow {
  user_id: string;
  role: 'owner' | 'staff';
  created_at: string;
  profile: {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
}

interface Props {
  tenantId: string;
  initialMembers: MemberRow[];
}

export default function TenantMembersClient({ tenantId, initialMembers }: Props) {
  const router = useRouter();
  const [members, setMembers] = useState<MemberRow[]>(initialMembers);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'staff'>('staff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to add member');
      setEmail('');
      setRole('staff');
      // Server component re-runs and ships the new roster.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setBusy(false);
  }

  async function remove(userId: string) {
    setError('');
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to remove member');
      // Optimistic local removal so the UI feels snappy; refresh keeps the
      // server view authoritative.
      setMembers((m) => m.filter((row) => row.user_id !== userId));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
  }

  return (
    <div className="bg-surface-900 border border-surface-800 rounded-2xl">
      <div className="p-4 border-b border-surface-800 flex items-center gap-2">
        <Users className="w-4 h-4 text-surface-500" />
        <h2 className="text-sm font-semibold text-white flex-1">
          Members ({members.length})
        </h2>
      </div>

      {error && (
        <div className="px-4 pt-3">
          <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-200 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Add member form */}
      <form onSubmit={add} className="p-4 border-b border-surface-800 flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="member@hotel.cy"
          className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-3 py-2 text-white placeholder-surface-500 text-sm focus:border-brand-500 focus:outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'owner' | 'staff')}
          className="bg-surface-800 border border-surface-700 rounded-xl px-3 py-2 text-white text-sm capitalize"
        >
          <option value="staff">Staff</option>
          <option value="owner">Owner</option>
        </select>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-surface-800 disabled:text-surface-500 text-white text-sm font-medium transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add
        </button>
      </form>

      {/* Roster */}
      {members.length === 0 ? (
        <p className="px-4 py-8 text-center text-surface-500 text-sm">
          No members yet. Add the tenant&apos;s primary contact above.
        </p>
      ) : (
        <ul className="divide-y divide-surface-800">
          {members.map((m) => (
            <li key={m.user_id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-800 flex items-center justify-center text-surface-400 text-xs font-semibold">
                {m.profile?.full_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">
                  {m.profile?.full_name ?? 'Unknown'}
                </div>
                {m.profile?.email && (
                  <div className="text-xs text-surface-500 truncate">{m.profile.email}</div>
                )}
              </div>
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${
                m.role === 'owner'
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'bg-surface-700 text-surface-300'
              }`}>
                {m.role === 'owner' ? <Crown className="w-2.5 h-2.5" /> : <ShieldCheck className="w-2.5 h-2.5" />}
                {m.role}
              </span>
              <button
                type="button"
                onClick={() => remove(m.user_id)}
                aria-label={`Remove ${m.profile?.full_name ?? 'member'}`}
                className="p-1.5 text-surface-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
