export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { ArrowLeft, Plane } from 'lucide-react';
import Link from 'next/link';
import AirportQueueClient from './AirportQueueClient';

export default async function AirportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // Fetch current queue for both airports
  const { data: lcaQueue } = await supabase
    .from('airport_queue')
    .select(`
      *,
      driver:profiles!driver_id(full_name, avatar_url, is_verified, car_make, car_model)
    `)
    .eq('airport', 'LCA')
    .eq('status', 'waiting')
    .order('position', { ascending: true })
    .limit(30);

  const { data: pfoQueue } = await supabase
    .from('airport_queue')
    .select(`
      *,
      driver:profiles!driver_id(full_name, avatar_url, is_verified, car_make, car_model)
    `)
    .eq('airport', 'PFO')
    .eq('status', 'waiting')
    .order('position', { ascending: true })
    .limit(30);

  // Check if user is already in a queue
  const { data: myEntry } = await supabase
    .from('airport_queue')
    .select('*')
    .eq('driver_id', user.id)
    .eq('status', 'waiting')
    .single();

  // Normalize
  const normalize = (items: any[]) => (items || []).map((item: any) => ({
    ...item,
    driver: Array.isArray(item.driver) ? item.driver[0] : item.driver,
  }));

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href="/app/feed" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Plane className="w-5 h-5 text-brand-400" />
        <h1 className="text-xl font-bold text-white">Airport Queue</h1>
      </header>

      <AirportQueueClient
        initialLCA={normalize(lcaQueue || [])}
        initialPFO={normalize(pfoQueue || [])}
        myEntry={myEntry}
        userId={user.id}
      />
    </div>
  );
}
