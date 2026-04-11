'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto flex items-center justify-center min-h-[60vh] px-4">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Something went wrong</h2>
        <p className="text-sm text-surface-400 mb-6">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl transition-colors text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
          <Link
            href="/app/feed"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface-800 hover:bg-surface-700 text-surface-300 font-medium rounded-xl transition-colors text-sm"
          >
            <Home className="w-4 h-4" />
            Feed
          </Link>
        </div>
      </div>
    </div>
  );
}
