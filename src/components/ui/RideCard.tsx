import Link from 'next/link';
import { MapPin, Clock, Users, Star } from 'lucide-react';
import { format } from 'date-fns';
import type { Ride } from '@/types/database';
import VerifiedBadge from './VerifiedBadge';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';

interface RideCardProps {
  ride: Ride & { driver?: { full_name: string; avatar_url: string | null; rating_avg: number; is_verified: boolean } };
}

export default function RideCard({ ride }: RideCardProps) {
  const departureDate = new Date(ride.departure_time);

  return (
    <Link href={`/app/ride/${ride.id}`} className="block">
      <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 hover:border-surface-700 transition-colors">
        {/* Route */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex flex-col items-center gap-1 pt-1">
            <div className="w-2.5 h-2.5 rounded-full bg-brand-500" />
            <div className="w-px h-8 bg-surface-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{ride.origin_address}</p>
            <div className="h-6" />
            <p className="text-white font-medium truncate">{ride.destination_address}</p>
          </div>
        </div>

        {/* Details row */}
        <div className="flex items-center gap-4 text-sm text-surface-400 mb-3">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {format(departureDate, 'EEE, MMM d - HH:mm')}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {ride.seats_available} seats
          </span>
        </div>

        {/* Driver + Price */}
        <div className="flex items-center justify-between pt-3 border-t border-surface-800">
          <div className="flex items-center gap-2">
            <img
              src={ride.driver?.avatar_url || `${AVATAR_PLACEHOLDER}${ride.driver?.full_name || 'D'}`}
              alt=""
              className="w-8 h-8 rounded-full object-cover bg-surface-800"
            />
            <div className="flex items-center gap-1">
              <span className="text-sm text-white font-medium">{ride.driver?.full_name || 'Driver'}</span>
              {ride.driver?.is_verified && <VerifiedBadge size="sm" />}
            </div>
            {ride.driver && ride.driver.rating_avg > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-surface-400">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                {ride.driver.rating_avg.toFixed(1)}
              </span>
            )}
          </div>
          <div className="text-right">
            <span className="text-lg font-bold text-white">{ride.currency === 'EUR' ? '\u20AC' : '$'}{Number(ride.price_per_seat).toFixed(2)}</span>
            <span className="text-xs text-surface-500 block">per seat</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
