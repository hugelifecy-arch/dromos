import { SkeletonHeader, SkeletonCard } from '@/components/ui/Skeleton';

export default function AppLoading() {
  return (
    <div className="max-w-lg mx-auto">
      <SkeletonHeader />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
