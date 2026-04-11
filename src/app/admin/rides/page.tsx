export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface SearchParams {
  page?: string;
  status?: string;
}

export default async function AdminRidesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const page = parseInt(params.page || '1');
  const perPage = 20;
  const offset = (page - 1) * perPage;
  const status = params.status || 'all';

  let dbQuery = supabase
    .from('rides')
    .select('id, origin_address, destination_address, departure_time, status, price_per_seat, seats_total, seats_available, driver_id, profiles:driver_id(full_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + perPage - 1);

  if (status !== 'all') {
    dbQuery = dbQuery.eq('status', status);
  }

  const { data: rides, count } = await dbQuery;
  const totalPages = Math.ceil((count || 0) / perPage);

  const statuses = ['all', 'upcoming', 'in_progress', 'completed', 'cancelled'];

  const statusStyle: Record<string, string> = {
    upcoming: 'bg-blue-500/10 text-blue-400',
    in_progress: 'bg-yellow-500/10 text-yellow-400',
    completed: 'bg-green-500/10 text-green-400',
    cancelled: 'bg-red-500/10 text-red-400',
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Rides</h1>

      {/* Status filters */}
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {statuses.map(s => (
          <Link
            key={s}
            href={`/admin/rides?status=${s}`}
            className={`px-3 py-2 text-xs rounded-xl transition-colors capitalize whitespace-nowrap ${
              status === s
                ? 'bg-brand-600 text-white'
                : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
            }`}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </Link>
        ))}
      </div>

      {/* Rides table */}
      <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-surface-500 border-b border-surface-800">
                <th className="px-4 py-3 font-medium">Route</th>
                <th className="px-4 py-3 font-medium">Driver</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Seats</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Departure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {rides?.map((ride: any) => {
                const driver = Array.isArray(ride.profiles) ? ride.profiles[0] : ride.profiles;
                return (
                  <tr key={ride.id} className="text-surface-300 hover:bg-surface-800/50">
                    <td className="px-4 py-3">
                      <p className="text-sm text-white truncate max-w-[250px]">
                        {ride.origin_address}
                      </p>
                      <p className="text-xs text-surface-500 truncate max-w-[250px]">
                        &rarr; {ride.destination_address}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-surface-400 text-sm">
                      {driver?.full_name || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-white">
                      &euro;{Number(ride.price_per_seat).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-surface-400">
                      {ride.seats_available}/{ride.seats_total}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusStyle[ride.status] || 'bg-surface-700 text-surface-400'}`}>
                        {ride.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-surface-500">
                      {format(new Date(ride.departure_time), 'MMM d, HH:mm')}
                    </td>
                  </tr>
                );
              })}
              {(!rides || rides.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-surface-500">No rides found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-800">
            <span className="text-xs text-surface-500">Page {page} of {totalPages} ({count} total)</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/admin/rides?page=${page - 1}&status=${status}`}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-surface-800 text-surface-400 rounded-lg hover:bg-surface-700"
                >
                  <ChevronLeft className="w-3 h-3" /> Prev
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/admin/rides?page=${page + 1}&status=${status}`}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-surface-800 text-surface-400 rounded-lg hover:bg-surface-700"
                >
                  Next <ChevronRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
