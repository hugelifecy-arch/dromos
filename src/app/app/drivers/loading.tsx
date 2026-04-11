import { SkeletonHeader, Skeleton } from '@/components/ui/Skeleton';

export default function DriversLoading() {
  return (
    <div className="max-w-lg mx-auto">
      <SkeletonHeader />
      <div className="p-4">
        <Skeleton className="h-11 w-full rounded-xl mb-4" />
        <div className="flex gap-2 overflow-x-auto mb-4">
          {[1,2,3,4,5].map(i => (
            <Skeleton key={i} className="h-8 w-20 rounded-full shrink-0" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
