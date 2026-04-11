import { SkeletonHeader, Skeleton, SkeletonRow } from '@/components/ui/Skeleton';

export default function AirportLoading() {
  return (
    <div className="max-w-lg mx-auto">
      <SkeletonHeader />
      <div className="flex gap-1 px-4 pt-4">
        <Skeleton className="flex-1 h-10 rounded-xl" />
        <Skeleton className="flex-1 h-10 rounded-xl" />
      </div>
      <div className="p-4">
        <Skeleton className="h-20 rounded-2xl mb-4" />
      </div>
      <div className="divide-y divide-surface-800">
        {[1,2,3,4].map(i => <SkeletonRow key={i} />)}
      </div>
    </div>
  );
}
