import { SkeletonHeader, SkeletonRow } from '@/components/ui/Skeleton';
import { Skeleton } from '@/components/ui/Skeleton';

export default function RidesLoading() {
  return (
    <div className="max-w-lg mx-auto">
      <SkeletonHeader />
      <div className="p-4">
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
      <div className="divide-y divide-surface-800">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="p-4 space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
