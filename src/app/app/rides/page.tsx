'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Search, MapPin, Calendar, Car } from 'lucide-react';
import type { Ride } from '@/types/database';
import RideCard from '@/components/ui/RideCard';

type RideWithDriver = Ride & {
  driver?: {
    full_name: string;
    avatar_url: string | null;
    rating_avg: number;
    is_verified: boolean;
  };
};

export default function RidesPage() {
  const supabase = createClient();
  const [rides, setRides] = useState<RideWithDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    loadRides();
  }, []);

  async function loadRides() {
    setLoading(true);
    const { data } = await supabase
      .from('rides')
      .select(`
        *,
        driver:profiles!driver_id(full_name, avatar_url, rating_avg, is_verified)
      `)
      .eq('status', 'upcoming')
      .gt('seats_available', 0)
      .gt('departure_time', new Date().toISOString())
      .order('departure_time', { ascending: true });
    setRides((data as RideWithDriver[]) || []);
    setLoading(false);
  }

  const filteredRides = useMemo(() => {
    return rides.filter((ride) => {
      if (fromFilter && !ride.origin_address.toLowerCase().includes(fromFilter.toLowerCase())) {
        return false;
      }
      if (toFilter && !ride.destination_address.toLowerCase().includes(toFilter.toLowerCase())) {
        return false;
      }
      if (dateFilter) {
        const rideDate = ride.departure_time.slice(0, 10);
        if (rideDate !== dateFilter) return false;
      }
      return true;
    });
  }, [rides, fromFilter, toFilter, dateFilter]);

  const hasActiveFilters = fromFilter || toFilter || dateFilter;

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40">
        <h1 className="text-xl font-bold text-white">Find a Ride</h1>
      </header>

      {/* Search / Filter bar */}
      <div className="p-4 space-y-3 border-b border-surface-800">
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
          <input
            type="text"
            placeholder="From where?"
            value={fromFilter}
            onChange={(e) => setFromFilter(e.target.value)}
            className="w-full bg-surface-800 border border-surface-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
          <input
            type="text"
            placeholder="To where?"
            value={toFilter}
            onChange={(e) => setToFilter(e.target.value)}
            className="w-full bg-surface-800 border border-surface-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full bg-surface-800 border border-surface-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>
        {hasActiveFilters && (
          <button
            onClick={() => { setFromFilter(''); setToFilter(''); setDateFilter(''); }}
            className="text-sm text-brand-400 hover:text-brand-300 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results */}
      <div className="p-4 space-y-3">
        {loading ? (
          <div className="py-12 text-center text-surface-500">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Loading rides...</p>
          </div>
        ) : filteredRides.length > 0 ? (
          filteredRides.map((ride) => (
            <RideCard key={ride.id} ride={ride} />
          ))
        ) : (
          <div className="py-12 text-center text-surface-500">
            <Car className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg mb-1">
              {hasActiveFilters ? 'No rides match your search' : 'No rides available'}
            </p>
            <p className="text-sm">
              {hasActiveFilters
                ? 'Try adjusting your filters or check back later'
                : 'Be the first to offer a ride!'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
