export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { Building2, Users, Wallet } from 'lucide-react';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';

export default async function CorporatePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // Check if user belongs to a corporate account
  const { data: membership } = await supabase
    .from('corporate_members')
    .select(`
      *,
      corporate:corporate_accounts(*)
    `)
    .eq('user_id', user.id)
    .single();

  if (!membership?.corporate) {
    return (
      <div className="max-w-lg mx-auto">
        <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40">
          <h1 className="text-xl font-bold text-white">Corporate</h1>
        </header>
        <div className="p-8 text-center text-surface-500">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg mb-2">No Corporate Account</p>
          <p className="text-sm mb-6">Ask your company admin to invite you, or contact us to set up a corporate account.</p>
          <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 text-left">
            <h3 className="text-white font-medium mb-2">Corporate benefits</h3>
            <ul className="space-y-2 text-sm text-surface-400">
              <li>- Centralized billing for team rides</li>
              <li>- Monthly allowance per employee</li>
              <li>- Usage reports & analytics</li>
              <li>- Priority support</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const corporate = membership.corporate;

  // Get team members
  const { data: members } = await supabase
    .from('corporate_members')
    .select('*, profile:profiles!user_id(full_name, avatar_url, email)')
    .eq('corporate_id', corporate.id)
    .order('joined_at', { ascending: true });

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40">
        <h1 className="text-xl font-bold text-white">Corporate</h1>
      </header>

      {/* Company info */}
      <div className="p-6 border-b border-surface-800">
        <div className="flex items-center gap-4">
          {corporate.logo_url ? (
            <img src={corporate.logo_url} alt="" className="w-14 h-14 rounded-xl object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-brand-600/20 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-brand-400" />
            </div>
          )}
          <div>
            <h2 className="text-lg font-bold text-white">{corporate.name}</h2>
            <p className="text-sm text-surface-400">{corporate.domain}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-surface-900 border border-surface-800 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-xs text-surface-400 mb-1">
              <Users className="w-3.5 h-3.5" /> Members
            </div>
            <p className="text-white font-bold">{members?.length || 0} / {corporate.max_employees}</p>
          </div>
          <div className="bg-surface-900 border border-surface-800 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-xs text-surface-400 mb-1">
              <Wallet className="w-3.5 h-3.5" /> Your Allowance
            </div>
            <p className="text-white font-bold">&euro;{Number(membership.monthly_allowance).toFixed(2)}/mo</p>
          </div>
        </div>
      </div>

      {/* Team members */}
      <div className="p-4">
        <h3 className="text-sm font-medium text-surface-400 mb-3">Team Members</h3>
        <div className="space-y-2">
          {members?.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 p-3 bg-surface-900 rounded-xl">
              <img
                src={m.profile?.avatar_url || `${AVATAR_PLACEHOLDER}${m.profile?.full_name || 'U'}`}
                alt=""
                className="w-9 h-9 rounded-full object-cover bg-surface-800"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{m.profile?.full_name}</p>
                <p className="text-xs text-surface-500">{m.profile?.email}</p>
              </div>
              <span className="text-xs text-surface-500 capitalize bg-surface-800 px-2 py-0.5 rounded-full">
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
