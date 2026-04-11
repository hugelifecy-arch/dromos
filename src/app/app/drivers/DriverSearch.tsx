'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

export default function DriverSearch({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/app/drivers?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push('/app/drivers');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 border-b border-surface-800">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search drivers by name..."
          className="w-full bg-surface-800 border border-surface-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
    </form>
  );
}
