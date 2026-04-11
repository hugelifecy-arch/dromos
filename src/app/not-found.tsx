import Link from 'next/link';
import { MapPinOff } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center mx-auto mb-4">
          <MapPinOff className="w-8 h-8 text-surface-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Page not found</h2>
        <p className="text-sm text-surface-400 mb-6">
          This route doesn&apos;t exist. Maybe the leg was already taken.
        </p>
        <Link
          href="/app/feed"
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl transition-colors"
        >
          Back to Feed
        </Link>
      </div>
    </div>
  );
}
