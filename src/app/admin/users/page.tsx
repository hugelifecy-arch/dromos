export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SearchParams {
  page?: string;
  q?: string;
  filter?: string;
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const page = parseInt(params.page || '1');
  const perPage = 20;
  const offset = (page - 1) * perPage;
  const query = params.q || '';
  const filter = params.filter || 'all';

  let dbQuery = supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, is_driver, is_verified, rating_avg, total_rides, total_drives, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + perPage - 1);

  if (query) {
    dbQuery = dbQuery.or(`full_name.ilike.%${query}%,email.ilike.%${query}%`);
  }

  if (filter === 'drivers') dbQuery = dbQuery.eq('is_driver', true);
  if (filter === 'verified') dbQuery = dbQuery.eq('is_verified', true);
  if (filter === 'passengers') dbQuery = dbQuery.eq('is_driver', false);

  const { data: users, count } = await dbQuery;
  const totalPages = Math.ceil((count || 0) / perPage);

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'drivers', label: 'Drivers' },
    { key: 'verified', label: 'Verified' },
    { key: 'passengers', label: 'Passengers' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Users</h1>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form className="flex-1">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search by name or email..."
            className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </form>
        <div className="flex gap-1">
          {filters.map(f => (
            <Link
              key={f.key}
              href={`/admin/users?filter=${f.key}${query ? `&q=${query}` : ''}`}
              className={`px-3 py-2 text-xs rounded-xl transition-colors ${
                filter === f.key
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Users table */}
      <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-surface-500 border-b border-surface-800">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3 font-medium">Rides</th>
                <th className="px-4 py-3 font-medium">Drives</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {users?.map((user: any) => (
                <tr key={user.id} className="text-surface-300 hover:bg-surface-800/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={user.avatar_url || `${AVATAR_PLACEHOLDER}${user.full_name}`}
                        alt=""
                        className="w-8 h-8 rounded-full bg-surface-700"
                      />
                      <div>
                        <p className="text-white text-sm font-medium">{user.full_name}</p>
                        <p className="text-xs text-surface-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {user.is_driver && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400">Driver</span>
                      )}
                      {user.is_verified && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400">Verified</span>
                      )}
                      {!user.is_driver && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-400">Passenger</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-surface-400">
                    {user.rating_avg > 0 ? `${Number(user.rating_avg).toFixed(1)} \u2605` : '\u2014'}
                  </td>
                  <td className="px-4 py-3 text-surface-400">{user.total_rides}</td>
                  <td className="px-4 py-3 text-surface-400">{user.total_drives}</td>
                  <td className="px-4 py-3 text-surface-500 text-xs">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {(!users || users.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-surface-500">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-800">
            <span className="text-xs text-surface-500">
              Page {page} of {totalPages} ({count} total)
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/admin/users?page=${page - 1}&filter=${filter}${query ? `&q=${query}` : ''}`}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-surface-800 text-surface-400 rounded-lg hover:bg-surface-700"
                >
                  <ChevronLeft className="w-3 h-3" /> Prev
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/admin/users?page=${page + 1}&filter=${filter}${query ? `&q=${query}` : ''}`}
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
