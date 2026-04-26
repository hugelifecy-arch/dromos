'use client';

// Inline Accept / Decline buttons for a handoff_proposed notification.
//
// Lives inside the (server-rendered) notifications list. The notification
// row itself is a Link that goes to the leg detail page; these buttons
// stop click propagation so the user can resolve the proposal without
// leaving the inbox.

import { useRouter } from 'next/navigation';
import { useState, type MouseEvent } from 'react';
import { Check, X } from 'lucide-react';

interface Props {
  proposalId: string;
}

export default function HandoffActions({ proposalId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState('');

  async function resolve(
    e: MouseEvent<HTMLButtonElement>,
    action: 'accept' | 'decline',
  ) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(action);
    setError('');
    try {
      const res = await fetch(`/api/handoff/${proposalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Failed to ${action}`);
      // Refresh server-rendered list so the resolved proposal disappears.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-1.5 ml-2">
      <button
        type="button"
        onClick={(e) => resolve(e, 'accept')}
        disabled={busy !== null}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-surface-800 text-white text-xs font-medium transition-colors"
      >
        <Check className="w-3 h-3" />
        {busy === 'accept' ? '…' : 'Accept'}
      </button>
      <button
        type="button"
        onClick={(e) => resolve(e, 'decline')}
        disabled={busy !== null}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-800 hover:bg-surface-700 disabled:opacity-50 text-surface-200 text-xs font-medium transition-colors"
      >
        <X className="w-3 h-3" />
        {busy === 'decline' ? '…' : 'Decline'}
      </button>
      {error && <p className="text-[10px] text-red-400 max-w-[120px]">{error}</p>}
    </div>
  );
}
