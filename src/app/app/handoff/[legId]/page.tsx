'use client';

// Driver-facing handoff flow.
//
// Route: /app/handoff/[legId]
//
// The current buyer of a confirmed leg picks a trusted colleague and sends
// a handoff proposal. Recipient gets the proposal as a notification with
// inline accept / decline; this page handles the send-side only.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Users, Check, X, Send } from 'lucide-react';

interface TrustedRow {
  trusted_id: string;
  established_at: string;
  profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export default function HandoffPage() {
  const params = useParams();
  const router = useRouter();
  const legId = typeof params?.legId === 'string'
    ? params.legId
    : Array.isArray(params?.legId) ? params.legId[0] : '';

  const [trusted, setTrusted] = useState<TrustedRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/trusted-drivers');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load trusted drivers');
      setTrusted(body.trusted as TrustedRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setLoading(false);
  }

  async function send() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/handoff/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legId,
          recipientId: selected,
          message: message.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to send proposal');
      setSuccess(true);
      // Land back on the leg detail after a beat.
      setTimeout(() => router.push(`/app/ride/${legId}`), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setBusy(false);
  }

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href={`/app/ride/${legId}`} className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Users className="w-5 h-5 text-brand-400" />
        <h1 className="text-xl font-bold text-white flex-1">Συνάδελφος</h1>
      </header>

      <main className="px-4 py-6 space-y-6">
        <p className="text-surface-300 text-sm">
          Hand this booking to a trusted colleague. They keep the passenger; the
          fare stays with you (settle off-platform).
        </p>

        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200 flex items-center gap-2">
            <Check className="w-4 h-4" />
            Proposal sent — waiting for your colleague to accept.
          </div>
        )}

        <section>
          <h2 className="text-sm font-semibold text-white mb-2">Choose colleague</h2>
          {loading && <p className="text-surface-500 text-sm">Loading…</p>}
          {!loading && trusted.length === 0 && (
            <div className="rounded-xl border border-surface-800 bg-surface-900 p-4 text-sm text-surface-300 space-y-2">
              <p>You don&apos;t have any trusted colleagues yet.</p>
              <Link
                href="/app/profile/trusted-drivers"
                className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300"
              >
                Add one →
              </Link>
            </div>
          )}
          {!loading && trusted.length > 0 && (
            <ul className="space-y-2">
              {trusted.map((row) => {
                const isSel = selected === row.trusted_id;
                return (
                  <li key={row.trusted_id}>
                    <button
                      type="button"
                      onClick={() => setSelected(row.trusted_id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                        isSel
                          ? 'border-brand-500 bg-brand-950/40'
                          : 'border-surface-800 bg-surface-900 hover:border-surface-700'
                      }`}
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
                      {isSel && <Check className="w-5 h-5 text-brand-400" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-white mb-2">Optional message</h2>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="π.χ. Καθυστερώ στο αεροδρόμιο, πες μου αν μπορείς να πάρεις τον επιβάτη."
            rows={3}
            maxLength={300}
            className="w-full px-4 py-3 rounded-xl bg-surface-900 border border-surface-800 text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none text-sm"
          />
          <p className="text-surface-500 text-xs mt-1">{message.length}/300</p>
        </section>

        <button
          type="button"
          onClick={send}
          disabled={!selected || busy || success}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-surface-800 disabled:text-surface-500 text-white font-medium transition-colors"
        >
          {busy ? (
            'Sending…'
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send proposal
            </>
          )}
        </button>

        <p className="text-surface-500 text-xs text-center">
          Proposals expire after 30 minutes if your colleague doesn&apos;t respond.
        </p>

        <button
          type="button"
          onClick={() => router.back()}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-2 text-surface-400 hover:text-white text-sm"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </main>
    </div>
  );
}
