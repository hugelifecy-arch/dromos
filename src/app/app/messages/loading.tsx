import { SkeletonHeader, SkeletonRow } from '@/components/ui/Skeleton';

export default function MessagesLoading() {
  return (
    <div className="max-w-lg mx-auto">
      <SkeletonHeader />
      <div className="divide-y divide-surface-800">
        {[1,2,3,4,5,6].map(i => <SkeletonRow key={i} />)}
      </div>
    </div>
  );
}
