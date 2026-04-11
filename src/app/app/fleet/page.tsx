export const dynamic = 'force-dynamic';
export const metadata = { title: 'My Fleet' };

import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import FleetClient from './FleetClient';

export default async function FleetPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-lg mx-auto">
      <FleetClient vehicles={vehicles || []} userId={user.id} />
    </div>
  );
}
