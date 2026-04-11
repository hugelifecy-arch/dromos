import { SkeletonHeader, Skeleton } from '@/components/ui/Skeleton';

export default function EarningsLoading() {
  return (
    <div className="max-w-lg mx-auto">
      <SkeletonHeader />
      <div className="flex gap-1 px-4 pt-4">
        {[1,2,3,4].map(i => (
          <Skeleton key={i} className="flex-1 h-9 rounded-xl" />
        ))}
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        {[1,2,3,4].map(i => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="px-4 pb-4">
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </div>
  );
}
