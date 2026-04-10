import { BadgeCheck } from 'lucide-react';

interface VerifiedBadgeProps {
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export default function VerifiedBadge({ size = 'md' }: VerifiedBadgeProps) {
  return (
    <BadgeCheck className={`${sizes[size]} text-brand-400 fill-brand-400/20 flex-shrink-0`} />
  );
}
