export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, MapPin, Clock, Users, Star, Luggage, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';
import VerifiedBadge from '@/components/ui/VerifiedBadge';
import Link from 'next/link';

export default async function RideDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: ride } = await supabase
    .from('rides')
    .select(`
      *,
      driver:profiles!driver_id(id, full_name, avatar_url, is_verified, rating_avg, rating_count, bio, car_make, car_model, car_color, car_plate)
    `)
    .eq('id', params.id)
    .single();

  if (!ride) notFound();

  const isDriver = ride.driver_id === user.id;

  // Check existing booking
  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('ride_id', ride.id)
    .eq('passenger_id', user.id)
    .single();

  const { data: bookings } = await supabase
    .from('bookings')
    .select('*, passenger:profiles!passenger_id(full_name, avatar_url)')
    .eq('ride_id', ride.id)
    .in('status', ['pending', 'confirmed']);

  const departure = new Date(ride.departure_time);

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href="/app/feed" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-white">Ride Details</h1>
      </header>

      {/* Route */}
      <div className="p-4 border-b border-surface-800">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1 pt-1.5">
            <div className="w-3 h-3 rounded-full bg-brand-500" />
            <div className="w-px h-12 bg-surface-700" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <div className="flex-1">
            <div className="mb-3">
              <p className="text-white font-medium">{ride.origin_address}</p>
              <p className="text-xs text-surface-500">Departure</p>
            </div>
            <div>
              <p className="text-white font-medium">{ride.destination_address}</p>
              <p className="text-xs text-surface-500">Arrival</p>
            </div>
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-3 gap-3 p-4 border-b border-surface-800">
        <div className="bg-surface-900 rounded-xl p-3 text-center">
          <Clock className="w-4 h-4 text-surface-500 mx-auto mb-1" />
          <p className="text-white text-sm font-medium">{format(departure, 'HH:mm')}</p>
          <p className="text-xs text-surface-500">{format(departure, 'EEE, MMM d')}</p>
        </div>
        <div className="bg-surface-900 rounded-xl p-3 text-center">
          <Users className="w-4 h-4 text-surface-500 mx-auto mb-1" />
          <p className="text-white text-sm font-medium">{ride.seats_available}/{ride.seats_total}</p>
          <p className="text-xs text-surface-500">seats left</p>
        </div>
        <div className="bg-surface-900 rounded-xl p-3 text-center">
          <Luggage className="w-4 h-4 text-surface-500 mx-auto mb-1" />
          <p className="text-white text-sm font-medium capitalize">{ride.luggage_size}</p>
          <p className="text-xs text-surface-500">luggage</p>
        </div>
      </div>

      {/* Price */}
      <div className="p-4 border-b border-surface-800 flex items-center justify-between">
        <span className="text-surface-400">Price per seat</span>
        <span className="text-2xl font-bold text-white">&euro;{Number(ride.price_per_seat).toFixed(2)}</span>
      </div>

      {/* Notes */}
      {ride.notes && (
        <div className="p-4 border-b border-surface-800">
          <p className="text-sm text-surface-400 mb-1">Notes</p>
          <p className="text-white text-sm">{ride.notes}</p>
        </div>
      )}

      {/* Driver */}
      <div className="p-4 border-b border-surface-800">
        <p className="text-sm text-surface-400 mb-3">Driver</p>
        <div className="flex items-center gap-3">
          <img
            src={ride.driver?.avatar_url || `${AVATAR_PLACEHOLDER}${ride.driver?.full_name || 'D'}`}
            alt=""
            className="w-12 h-12 rounded-full object-cover bg-surface-800"
          />
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-white font-medium">{ride.driver?.full_name}</span>
              {ride.driver?.is_verified && <VerifiedBadge size="sm" />}
            </div>
            <div className="flex items-center gap-2 text-sm text-surface-400">
              {ride.driver?.rating_avg > 0 && (
                <span className="flex items-center gap-0.5">
                  <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                  {ride.driver.rating_avg.toFixed(1)} ({ride.driver.rating_count})
                </span>
              )}
              {ride.driver?.car_make && (
                <span>{ride.driver.car_color} {ride.driver.car_make} {ride.driver.car_model}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Passengers (visible to driver) */}
      {isDriver && bookings && bookings.length > 0 && (
        <div className="p-4 border-b border-surface-800">
          <p className="text-sm text-surface-400 mb-3">Passengers ({bookings.length})</p>
          <div className="space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="flex items-center gap-3 p-2 bg-surface-900 rounded-xl">
                <img
                  src={b.passenger?.avatar_url || `${AVATAR_PLACEHOLDER}${b.passenger?.full_name}`}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover bg-surface-800"
                />
                <span className="text-sm text-white">{b.passenger?.full_name}</span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                  b.status === 'confirmed' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
                }`}>
                  {b.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action */}
      <div className="p-4 space-y-3">
        {!isDriver && !existingBooking && ride.seats_available > 0 && (
          <form action={async () => {
            'use server';
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            await supabase.from('bookings').insert({
              ride_id: ride.id,
              passenger_id: user.id,
              seats_booked: 1,
              total_price: ride.price_per_seat,
            });
          }}>
            <button
              type="submit"
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl transition-colors"
            >
              Book this Ride - &euro;{Number(ride.price_per_seat).toFixed(2)}
            </button>
          </form>
        )}

        {existingBooking && (
          <div className={`text-center py-3 rounded-xl text-sm font-medium ${
            existingBooking.status === 'confirmed' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
          }`}>
            Booking {existingBooking.status}
          </div>
        )}

        {!isDriver && (
          <button className="w-full flex items-center justify-center gap-2 bg-surface-800 hover:bg-surface-700 text-white font-medium py-3 rounded-xl transition-colors">
            <MessageCircle className="w-4 h-4" />
            Message Driver
          </button>
        )}
      </div>
    </div>
  );
}
