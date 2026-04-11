'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import { MapPin, Clock, Users, LogOut, Car } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';
import VerifiedBadge from '@/components/ui/VerifiedBadge';
import Link from 'next/link';

interface QueueEntry {
  id: string;
  airport: string;
  driver_id: string;
  position: number;
  asking_price: number;
  passenger_capacity: number;
  vehicle_type: string;
  notes: string | null;
  status: string;
  joined_at: string;
  driver: { full_name: string; avatar_url: string | null; is_verified: boolean; car_make: string | null; car_model: string | null } | null;
}

interface Props {
  initialLCA: QueueEntry[];
  initialPFO: QueueEntry[];
  myEntry: any | null;
  userId: string;
}

export default function AirportQueueClient({ initialLCA, initialPFO, myEntry, userId }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [tab, setTab] = useState<'LCA' | 'PFO'>('LCA');
  const [lcaQueue, setLcaQueue] = useState(initialLCA);
  const [pfoQueue, setPfoQueue] = useState(initialPFO);
  const [inQueue, setInQueue] = useState(!!myEntry);
  const [showJoin, setShowJoin] = useState(false);
  const [joining, setJoining] = useState(false);

  // Join form
  const [joinAirport, setJoinAirport] = useState<'LCA' | 'PFO'>('LCA');
  const [askingPrice, setAskingPrice] = useState('30');
  const [capacity, setCapacity] = useState(4);
  const [vehicleType, setVehicleType] = useState('sedan');
  const [notes, setNotes] = useState('');

  const queue = tab === 'LCA' ? lcaQueue : pfoQueue;

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('airport-queue-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'airport_queue' }, () => {
        router.refresh();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);

    const { error } = await supabase.from('airport_queue').insert({
      airport: joinAirport,
      driver_id: userId,
      asking_price: parseFloat(askingPrice),
      passenger_capacity: capacity,
      vehicle_type: vehicleType,
      notes: notes || null,
    });

    if (!error) {
      setInQueue(true);
      setShowJoin(false);
      router.refresh();
    }
    setJoining(false);
  }

  async function handleLeave() {
    if (!myEntry) return;
    await supabase.from('airport_queue').delete().eq('id', myEntry.id);
    setInQueue(false);
    router.refresh();
  }

  const myPosition = myEntry ? (tab === myEntry.airport ? queue.findIndex(q => q.driver_id === userId) + 1 : null) : null;

  return (
    <>
      {/* My status banner */}
      {inQueue && myEntry && (
        <div className="mx-4 mt-4 bg-brand-600/10 border border-brand-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-brand-400" />
              <span className="text-sm font-medium text-white">
                You&apos;re in the {myEntry.airport === 'LCA' ? 'Larnaca' : 'Paphos'} queue
              </span>
            </div>
            <button
              onClick={handleLeave}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <LogOut className="w-3 h-3" />
              Leave
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold text-brand-400">#{myEntry.position}</p>
              <p className="text-[10px] text-surface-400">Position</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">&euro;{myEntry.asking_price}</p>
              <p className="text-[10px] text-surface-400">Your Price</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{myEntry.passenger_capacity}</p>
              <p className="text-[10px] text-surface-400">Seats</p>
            </div>
          </div>
        </div>
      )}

      {/* Airport tabs */}
      <div className="flex border-b border-surface-800 mt-2">
        <button
          onClick={() => setTab('LCA')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'LCA' ? 'text-white border-b-2 border-brand-500' : 'text-surface-500'
          }`}
        >
          Larnaca (LCA)
          <span className="ml-1.5 text-xs text-surface-500">{lcaQueue.length}</span>
        </button>
        <button
          onClick={() => setTab('PFO')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'PFO' ? 'text-white border-b-2 border-brand-500' : 'text-surface-500'
          }`}
        >
          Paphos (PFO)
          <span className="ml-1.5 text-xs text-surface-500">{pfoQueue.length}</span>
        </button>
      </div>

      {/* Join button */}
      {!inQueue && (
        <div className="p-4">
          <button
            onClick={() => { setJoinAirport(tab); setShowJoin(true); }}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl transition-colors"
          >
            Join {tab === 'LCA' ? 'Larnaca' : 'Paphos'} Queue
          </button>
        </div>
      )}

      {/* Join form */}
      {showJoin && (
        <form onSubmit={handleJoin} className="p-4 border-b border-surface-800 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-surface-400 mb-1">Airport</label>
              <select
                value={joinAirport}
                onChange={(e) => setJoinAirport(e.target.value as 'LCA' | 'PFO')}
                className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="LCA">Larnaca (LCA)</option>
                <option value="PFO">Paphos (PFO)</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-surface-400 mb-1">Price (EUR)</label>
              <input
                type="number"
                min="5"
                step="1"
                value={askingPrice}
                onChange={(e) => setAskingPrice(e.target.value)}
                required
                className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-surface-400 mb-1">Seats</label>
              <select
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value))}
                className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-surface-400 mb-1">Vehicle</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="sedan">Sedan</option>
                <option value="minivan">Minivan</option>
                <option value="van">Van</option>
                <option value="luxury">Luxury</option>
              </select>
            </div>
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional, e.g. 'Can go to Nicosia')"
            className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowJoin(false)}
              className="flex-1 border border-surface-700 text-surface-300 font-medium py-2.5 rounded-xl hover:bg-surface-800 transition-colors text-sm">
              Cancel
            </button>
            <button type="submit" disabled={joining}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm">
              {joining ? 'Joining...' : 'Join Queue'}
            </button>
          </div>
        </form>
      )}

      {/* Queue list */}
      <div className="divide-y divide-surface-800">
        {queue.length === 0 && (
          <div className="p-8 text-center text-surface-500">
            <Car className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg mb-1">Queue is empty</p>
            <p className="text-sm">Be the first driver at {tab === 'LCA' ? 'Larnaca' : 'Paphos'} Airport</p>
          </div>
        )}

        {queue.map((entry, idx) => {
          const isMe = entry.driver_id === userId;
          return (
            <div key={entry.id} className={`p-4 flex items-center gap-3 ${isMe ? 'bg-brand-600/5' : ''}`}>
              {/* Position */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                idx === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                idx === 1 ? 'bg-surface-700 text-surface-300' :
                idx === 2 ? 'bg-orange-500/20 text-orange-400' :
                'bg-surface-800 text-surface-500'
              }`}>
                {entry.position}
              </div>

              {/* Driver info */}
              <Link href={`/app/driver/${entry.driver_id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <img
                    src={entry.driver?.avatar_url || `${AVATAR_PLACEHOLDER}${entry.driver?.full_name || 'D'}`}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover bg-surface-800"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={`text-sm font-medium truncate ${isMe ? 'text-brand-400' : 'text-white'}`}>
                        {isMe ? 'You' : entry.driver?.full_name}
                      </span>
                      {entry.driver?.is_verified && <VerifiedBadge size="sm" />}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-surface-500">
                      {entry.driver?.car_make && (
                        <span>{entry.driver.car_make} {entry.driver.car_model}</span>
                      )}
                      <span className="capitalize">{entry.vehicle_type}</span>
                      <span>{entry.passenger_capacity} seats</span>
                    </div>
                  </div>
                </div>
              </Link>

              {/* Price & time */}
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-white">&euro;{entry.asking_price}</p>
                <p className="text-[10px] text-surface-500 flex items-center gap-0.5 justify-end">
                  <Clock className="w-2.5 h-2.5" />
                  {formatDistanceToNow(new Date(entry.joined_at), { addSuffix: false })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
