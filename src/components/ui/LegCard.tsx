import Link from 'next/link';
import { Clock, Users, Package, Star } from 'lucide-react';
import { format } from 'date-fns';
import type { EmptyLeg } from '@/lib/types/empty-leg';
import VerifiedBadge from './VerifiedBadge';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';

interface LegCardProps {
  leg: EmptyLeg & {
    seller?: {
      full_name: string;
      avatar_url: string | null;
      rating: number;
      completion_rate: number;
      is_verified?: boolean;
    }
  };
}

const LEG_TYPE_COLORS: Record<string, { bg: string; badge: string; label: string }> = {
  standard: { bg: 'bg-surface-700', badge: 'bg-surface-600 text-surface-300', label: 'Standard' },
  airport_inbound: { bg: 'bg-blue-500/20', badge: 'bg-blue-500/30 text-blue-300', label: 'Airport Inbound' },
  airport_outbound: { bg: 'bg-blue-500/20', badge: 'bg-blue-500/30 text-blue-300', label: 'Airport Outbound' },
  long_distance: { bg: 'bg-purple-500/20', badge: 'bg-purple-500/30 text-purple-300', label: 'Long Distance' },
  repositioning: { bg: 'bg-amber-500/20', badge: 'bg-amber-500/30 text-amber-300', label: 'Repositioning Only' },
};

const LUGGAGE_LABELS: Record<string, string> = {
  none: 'No luggage',
  small: 'Small bag',
  medium: 'Medium',
  large: 'Large',
};

export default function LegCard({ leg }: LegCardProps) {
  const departureDate = new Date(leg.departure_datetime);
  const legTypeConfig = LEG_TYPE_COLORS[leg.leg_type] || LEG_TYPE_COLORS.standard;

  return (
    <Link href={`/app/ride/${leg.id}`} className="block">
      <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 hover:border-surface-700 transition-colors">
        {/* Route */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex flex-col items-center gap-1 pt-1">
            <div className="w-2.5 h-2.5 rounded-full bg-brand-500" />
            <div className="w-px h-8 bg-surface-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{leg.origin}</p>
            <div className="h-6" />
            <p className="text-white font-medium truncate">{leg.destination}</p>
          </div>
        </div>

        {/* Leg Type Badge */}
        <div className="mb-3">
          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${legTypeConfig.badge}`}>
            {legTypeConfig.label}
          </span>
        </div>

        {/* Details row */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-surface-400 mb-3">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {format(departureDate, 'EEE, MMM d - HH:mm')}
          </span>
          {leg.is_time_flexible && (
            <span className="text-xs bg-surface-800 px-2 py-0.5 rounded text-surface-300">
              Flexible
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {leg.passenger_capacity} seat{leg.passenger_capacity !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Package className="w-3.5 h-3.5" />
            {LUGGAGE_LABELS[leg.luggage_capacity] || leg.luggage_capacity}
          </span>
        </div>

        {/* Price + Fare Included Badge */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <span className="text-3xl font-bold text-white">
              €{Number(leg.asking_price).toFixed(2)}
            </span>
          </div>
          {leg.has_passenger && (
            <span className="text-xs bg-brand-500/20 text-brand-300 px-2.5 py-1 rounded-full">
              Fare included
            </span>
          )}
        </div>

        {/* Seller Info + CTA */}
        <div className="flex items-center justify-between pt-3 border-t border-surface-800">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={leg.seller?.avatar_url || `${AVATAR_PLACEHOLDER}${leg.seller?.full_name || 'D'}`}
              alt=""
              className="w-8 h-8 rounded-full object-cover bg-surface-800 flex-shrink-0"
            />
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-sm text-white font-medium truncate">
                {leg.seller?.full_name || 'Driver'}
              </span>
              {leg.seller?.is_verified && <VerifiedBadge size="sm" />}
            </div>
            {leg.seller && leg.seller.rating > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-surface-400 flex-shrink-0">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                {leg.seller.rating.toFixed(1)}
              </span>
            )}
          </div>
          <button className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0">
            Claim
          </button>
        </div>
      </div>
    </Link>
  );
}
