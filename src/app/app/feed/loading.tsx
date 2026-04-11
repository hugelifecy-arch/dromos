import { SkeletonHeader, SkeletonCard } from '@/components/ui/Skeleton';

export default function FeedLoading() {
  return (
    <div className="max-w-lg mx-auto">
      <SkeletonHeader />
      <div className="flex gap-2 px-4 py-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="animate-pulse h-8 w-20 rounded-full bg-surface-800" />
        ))}
      </div>
      <div className="divide-y divide-surface-800">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
