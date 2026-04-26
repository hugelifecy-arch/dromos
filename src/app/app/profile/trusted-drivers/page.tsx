'use client';

// Trusted-drivers list / add / remove.
//
// Route: /app/profile/trusted-drivers
//
// One-directional trust graph: this user trusts these other drivers. They
// can hand off confirmed legs to anyone in this list. The list does NOT
// imply mutual trust.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, Plus, Trash2 } from 'lucide-react';

interface TrustedRow {
  trusted_id: string;
  established_at: string;
  profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export default function TrustedDriversPage() {
  const [rows, setRows] = useState<TrustedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [trustedId, setTrustedId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/trusted-drivers');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load');
      setRows(body.trusted as TrustedRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setLoading(false);
  }

  async function add() {
    if (!trustedId.trim()) return;
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/trusted-drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trustedId: trustedId.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to add');
      setTrustedId('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setAdding(false);
  }

  async function remove(id: string) {
    setError('');
    try {
      const res = await fetch('/api/trusted-drivers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trustedId: id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to remove');
      setRows((prev) => prev.filter((r) => r.trusted_id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href="/app/profile" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Users className="w-5 h-5 text-brand-400" />
        <h1 className="text-xl font-bold text-white flex-1">Έμπιστοι συνάδελφοι</h1>
      </header>

      <main className="px-4 py-6 space-y-6">
        <p className="text-surface-300 text-sm">
          Drivers in this list can receive a handoff from you. The trust is
          one-way: adding someone here does <span className="text-white">not</span> let them
          hand off to you.
        </p>

        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="space-y-2">
          <label className="block text-sm font-semibold text-white">Add by user ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={trustedId}
              onChange={(e) => setTrustedId(e.target.value)}
              placeholder="UUID of a verified driver"
              className="flex-1 px-3 py-2 rounded-xl bg-surface-900 border border-surface-800 text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none text-sm"
            />
            <button
              type="button"
              onClick={add}
              disabled={adding || !trustedId.trim()}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-surface-800 disabled:text-surface-500 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
          <p className="text-surface-500 text-xs">
            For now you need their user ID. A search-by-phone flow lands when the
            WhatsApp bot integration goes live.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-white mb-2">
            Your trusted colleagues ({rows.length})
          </h2>
          {loading && <p className="text-surface-500 text-sm">Loading…</p>}
          {!loading && rows.length === 0 && (
            <p className="text-surface-500 text-sm">
              You haven&apos;t added any trusted colleagues yet.
            </p>
          )}
          {!loading && rows.length > 0 && (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li
                  key={row.trusted_id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-surface-800 bg-surface-900"
                >
                  <div className="w-10 h-10 rounded-full bg-surface-800 flex items-center justify-center text-surface-400 font-semibold">
                    {row.profile?.full_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-medium">
                      {row.profile?.full_name ?? 'Driver'}
                    </div>
                    <div className="text-surface-500 text-xs">
                      Trusted since {new Date(row.established_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(row.trusted_id)}
                    className="p-2 text-surface-500 hover:text-red-400 transition-colors"
                    aria-label="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
