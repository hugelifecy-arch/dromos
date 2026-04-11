export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import VerificationsClient from './VerificationsClient';

export default async function AdminVerificationsPage() {
  const supabase = await createClient();

  const { data: verifications } = await supabase
    .from('driver_verification')
    .select('*, profile:user_id(full_name, email, avatar_url, phone)')
    .order('created_at', { ascending: false });

  // Normalize joins
  const normalized = (verifications || []).map((v: any) => ({
    ...v,
    profile: Array.isArray(v.profile) ? v.profile[0] : v.profile,
  }));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Driver Verifications</h1>
      <VerificationsClient verifications={normalized} />
    </div>
  );
}
