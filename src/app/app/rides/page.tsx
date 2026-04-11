'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Clock } from 'lucide-react';
import type { EmptyLeg } from '@/lib/types/empty-leg';
import LegCard from '@/components/ui/LegCard';

type SortOption = 'soonest' | 'latest' | 'lowest-price' | 'highest-price';
type LegTypeFilter = 'all' | 'airport' | 'long_distance' | 'standard' | 'repositioning';

interface FilterState {
  from: string;
  to: string;
  date: string;
  legType: LegTypeFilter;
  sort: SortOption;
}

export default function RidesPage() {
  const supabase = createClient();
  const [legs, setLegs] = useState<(EmptyLeg & { seller?: any })[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    from: '',
    to: '',
    date: '',
    legType: 'all',
    sort: 'soonest',
  });

  // Debounced fetch function
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const fetchLegs = useCallback((currentFilters: FilterState) => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('empty_legs')
          .select(`
            *,
            seller:profiles!seller_id(
              id,
              full_name,
              avatar_url,
              is_verified,
              rating_avg
            )
          `)
          .eq('status', 'open')
          .gt('departure_datetime', new Date().toISOString());

        // Apply text filters with ilike
        if (currentFilters.from) {
          query = query.ilike('origin', `%${currentFilters.from}%`);
        }
        if (currentFilters.to) {
          query = query.ilike('destination', `%${currentFilters.to}%`);
        }

        // Apply date filter
        if (currentFilters.date) {
          const dateStart = new Date(currentFilters.date);
          const dateEnd = new Date(currentFilters.date);
          dateEnd.setDate(dateEnd.getDate() + 1);

          query = query
            .gte('departure_datetime', dateStart.toISOString())
            .lt('departure_datetime', dateEnd.toISOString());
        }

        // Apply leg type filter
        if (currentFilters.legType !== 'all') {
          if (currentFilters.legType === 'airport') {
            query = query.in('leg_type', ['airport_inbound', 'airport_outbound']);
          } else {
            query = query.eq('leg_type', currentFilters.legType);
          }
        }

        // Apply sorting
        switch (currentFilters.sort) {
          case 'soonest':
            query = query.order('departure_datetime', { ascending: true });
            break;
          case 'latest':
            query = query.order('created_at', { ascending: false });
            break;
          case 'lowest-price':
            query = query.order('asking_price', { ascending: true });
            break;
          case 'highest-price':
            query = query.order('asking_price', { ascending: false });
            break;
        }

        const { data, error } = await query;

        if (error) {
          console.error('Error fetching legs:', error);
          setLegs([]);
        } else {
          setLegs(data || []);
        }
      } catch (error) {
        console.error('Unexpected error:', error);
        setLegs([]);
      } finally {
        setLoading(false);
      }
    }, 500);
  }, [supabase]);

  // Trigger fetch on filter changes
  useEffect(() => {
    fetchLegs(filters);
  }, [filters, fetchLegs]);

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Available Legs</h1>
            {legs.length > 0 && (
              <p className="text-xs text-surface-400 mt-1">{legs.length} leg{legs.length !== 1 ? 's' : ''} available</p>
            )}
          </div>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="bg-surface-900 border-b border-surface-800 p-4 space-y-3">
        {/* From & To inputs */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="From..."
            value={filters.from}
            onChange={(e) => handleFilterChange('from', e.target.value)}
            className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
          />
          <input
            type="text"
            placeholder="To..."
            value={filters.to}
            onChange={(e) => handleFilterChange('to', e.target.value)}
            className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
          />
        </div>

        {/* Date, Leg Type, Sort */}
        <div className="flex gap-2">
          <input
            type="date"
            value={filters.date}
            onChange={(e) => handleFilterChange('date', e.target.value)}
            className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
          />
          <select
            value={filters.legType}
            onChange={(e) => handleFilterChange('legType', e.target.value as LegTypeFilter)}
            className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all appearance-none bg-no-repeat cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 8px center',
              paddingRight: '24px',
            }}
          >
            <option value="all">All</option>
            <option value="airport">Airport</option>
            <option value="long_distance">Long Distance</option>
            <option value="standard">Standard</option>
            <option value="repositioning">Repositioning</option>
          </select>
          <select
            value={filters.sort}
            onChange={(e) => handleFilterChange('sort', e.target.value as SortOption)}
            className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all appearance-none bg-no-repeat cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 8px center',
              paddingRight: '24px',
            }}
          >
            <option value="soonest">Soonest departure</option>
            <option value="latest">Latest posted</option>
            <option value="lowest-price">Lowest price</option>
            <option value="highest-price">Highest price</option>
          </select>
        </div>
      </div>

      {/* Leg Cards List */}
      <div className="divide-y divide-surface-800">
        {loading && legs.length === 0 ? (
          <div className="p-8 text-center text-surface-400">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-50 animate-spin" />
            <p className="text-sm">Loading available legs...</p>
          </div>
        ) : legs.length > 0 ? (
          <div className="p-4 space-y-3">
            {legs.map((leg) => (
              <LegCard key={leg.id} leg={leg} />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-surface-500">
            <p className="text-lg mb-1">No legs available matching your filters</p>
            <p className="text-sm">Try broadening your search or check back soon.</p>
          </div>
        )}
      </div>
    </div>
  );
}
