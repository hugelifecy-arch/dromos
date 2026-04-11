import { SkeletonHeader, Skeleton, SkeletonRow } from '@/components/ui/Skeleton';

export default function FleetLoading() {
  return (
    <div className="max-w-lg mx-auto">
      <SkeletonHeader />
      <div className="mx-4 mt-4">
        <Skeleton className="h-20 rounded-2xl mb-4" />
      </div>
      <div className="divide-y divide-surface-800">
        {[1,2,3].map(i => <SkeletonRow key={i} />)}
      </div>
    </div>
  );
}
