export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Clock, Users, Star, Luggage, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';
import VerifiedBadge from '@/components/ui/VerifiedBadge';
import Link from 'next/link';

const LEG_TYPE_COLORS: Record<string, { dot: string; badge: string; text: string }> = {
  Airport: { dot: 'bg-blue-500', badge: 'bg-blue-500/10 text-blue-400', text: 'Airport' },
  'Long Distance': { dot: 'bg-purple-500', badge: 'bg-purple-500/10 text-purple-400', text: 'Long Distance' },
  Standard: { dot: 'bg-surface-500', badge: 'bg-surface-700 text-surface-300', text: 'Standard' },
  Repositioning: { dot: 'bg-amber-500', badge: 'bg-amber-500/10 text-amber-400', text: 'Repositioning' },
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-500/10 text-green-400',
  claimed: 'bg-yellow-500/10 text-yellow-400',
  confirmed: 'bg-blue-500/10 text-blue-400',
  in_progress: 'bg-purple-500/10 text-purple-400',
  completed: 'bg-green-500/10 text-green-400',
  cancelled: 'bg-red-500/10 text-red-400',
  expired: 'bg-surface-700 text-surface-300',
};

async function claimLeg(legId: string, userId: string) {
  'use server';
  const supabase = await createClient();
  await supabase
    .from('empty_legs')
    .update({
      buyer_id: userId,
      status: 'claimed',
      claimed_at: new Date().toISOString(),
    })
    .eq('id', legId);
}

async function editLeg(legId: string) {
  'use server';
  // Placeholder for edit action
}

async function cancelLeg(legId: string) {
  'use server';
  const supabase = await createClient();
  await supabase
    .from('empty_legs')
    .update({ status: 'cancelled' })
    .eq('id', legId);
}

async function confirmHandoff(legId: string) {
  'use server';
  const supabase = await createClient();
  await supabase
    .from('empty_legs')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', legId);
}

async function rejectClaim(legId: string) {
  'use server';
  const supabase = await createClient();
  await supabase
    .from('empty_legs')
    .update({
      buyer_id: null,
      status: 'open',
    })
    .eq('id', legId);
}

export default async function LegDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: leg } = await supabase
    .from('empty_legs')
    .select(`
      *,
      seller:profiles!seller_id(id, full_name, avatar_url, is_verified, rating_avg, rating_count, bio),
      buyer:profiles!buyer_id(id, full_name, avatar_url, phone_number)
    `)
    .eq('id', id)
    .single();

  if (!leg) notFound();

  const isSeller = leg.seller_id === user.id;
  const isBuyer = leg.buyer_id === user.id;
  const isOpen = leg.status === 'open';
  const isClaimed = leg.status === 'claimed';
  const isConfirmed = leg.status === 'confirmed';

  const legTypeInfo = LEG_TYPE_COLORS[leg.leg_type] || LEG_TYPE_COLORS.Standard;
  const departure = new Date(leg.departure_datetime);

  const showPassengerDetails = isConfirmed || (isSeller && (isClaimed || isConfirmed));

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href="/app/feed" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-white">Leg Details</h1>
      </header>

      {/* Route */}
      <div className="p-4 border-b border-surface-800">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1 pt-1.5">
            <div className={`w-3 h-3 rounded-full ${legTypeInfo.dot}`} />
            <div className="w-px h-12 bg-surface-700" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <div className="flex-1">
            <div className="mb-3">
              <p className="text-white font-medium">{leg.origin_location}</p>
              <p className="text-xs text-surface-500">Origin</p>
            </div>
            <div>
              <p className="text-white font-medium">{leg.destination_location}</p>
              <p className="text-xs text-surface-500">Destination</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${legTypeInfo.badge}`}>
            {legTypeInfo.text}
          </span>
          {leg.is_time_flexible && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-surface-700 text-surface-300">
              Flexible
            </span>
          )}
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
          <p className="text-white text-sm font-medium">{leg.seats_available}</p>
          <p className="text-xs text-surface-500">seats available</p>
        </div>
        <div className="bg-surface-900 rounded-xl p-3 text-center">
          <Luggage className="w-4 h-4 text-surface-500 mx-auto mb-1" />
          <p className="text-white text-sm font-medium capitalize">{leg.luggage_capacity}</p>
          <p className="text-xs text-surface-500">luggage</p>
        </div>
      </div>

      {/* Pricing */}
      <div className="p-4 border-b border-surface-800">
        <div className="flex items-end justify-between mb-3">
          <span className="text-surface-400">Asking Price</span>
          <span className="text-3xl font-bold text-white">&euro;{Number(leg.asking_price).toFixed(2)}</span>
        </div>
        <p className="text-xs text-surface-400">
          If this leg includes a passenger fare, you collect that from the passenger directly. The asking price goes to the seller.
        </p>
      </div>

      {/* Has passenger */}
      {leg.has_passenger && (
        <div className="p-4 border-b border-surface-800">
          <p className="text-sm text-surface-400 mb-3">Passenger</p>
          <div className="bg-surface-900 rounded-xl p-3 space-y-2">
            <div>
              <p className="text-xs text-surface-500">Count</p>
              <p className="text-white font-medium">{leg.passenger_count} {leg.passenger_count === 1 ? 'person' : 'people'}</p>
            </div>
            {leg.passenger_special_requirements && (
              <div>
                <p className="text-xs text-surface-500">Special Requirements</p>
                <p className="text-white text-sm">{leg.passenger_special_requirements}</p>
              </div>
            )}
            {!showPassengerDetails && (
              <p className="text-xs text-surface-500 italic pt-2">[Hidden until handoff confirmed]</p>
            )}
            {showPassengerDetails && (
              <div className="space-y-1 pt-2 border-t border-surface-800">
                <div>
                  <p className="text-xs text-surface-500">Name</p>
                  <p className="text-white text-sm">{leg.passenger_name}</p>
                </div>
                {leg.passenger_phone && (
                  <div>
                    <p className="text-xs text-surface-500">Phone</p>
                    <p className="text-white text-sm">{leg.passenger_phone}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Seller info */}
      <div className="p-4 border-b border-surface-800">
        <p className="text-sm text-surface-400 mb-3">Seller</p>
        <div className="flex items-center gap-3">
          <img
            src={leg.seller?.avatar_url || `${AVATAR_PLACEHOLDER}${leg.seller?.full_name || 'S'}`}
            alt=""
            className="w-12 h-12 rounded-full object-cover bg-surface-800"
          />
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-white font-medium">{leg.seller?.full_name}</span>
              {leg.seller?.is_verified && <VerifiedBadge size="sm" />}
            </div>
            {leg.seller?.rating_avg !== null && leg.seller?.rating_avg > 0 && (
              <div className="flex items-center gap-0.5 text-sm text-surface-400">
                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                {leg.seller.rating_avg.toFixed(1)} ({leg.seller.rating_count})
              </div>
            )}
          </div>
        </div>
        {!isSeller && (
          <button className="w-full mt-3 flex items-center justify-center gap-2 bg-surface-800 hover:bg-surface-700 text-white font-medium py-2.5 rounded-xl transition-colors text-sm">
            <MessageCircle className="w-4 h-4" />
            Message Seller
          </button>
        )}
      </div>

      {/* Notes */}
      {leg.notes && (
        <div className="p-4 border-b border-surface-800">
          <p className="text-sm text-surface-400 mb-2">Notes</p>
          <p className="text-white text-sm">{leg.notes}</p>
        </div>
      )}

      {/* Status badge */}
      {!isOpen && (
        <div className="p-4 border-b border-surface-800">
          <span className={`inline-block text-xs font-medium px-3 py-1.5 rounded-full ${STATUS_COLORS[leg.status]}`}>
            {leg.status.charAt(0).toUpperCase() + leg.status.slice(1).replace('_', ' ')}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="p-4 space-y-3">
        {/* Non-seller viewing open leg */}
        {!isSeller && isOpen && (
          <form action={async () => {
            'use server';
            await claimLeg(id, user.id);
          }}>
            <button
              type="submit"
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl transition-colors"
            >
              Claim This Leg
            </button>
          </form>
        )}

        {/* Seller viewing own open leg */}
        {isSeller && isOpen && (
          <div className="flex gap-3">
            <button
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl transition-colors"
            >
              Edit
            </button>
            <form action={async () => {
              'use server';
              await cancelLeg(id);
            }} className="flex-1">
              <button
                type="submit"
                className="w-full bg-surface-800 hover:bg-surface-700 text-white font-medium py-3 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </form>
          </div>
        )}

        {/* Seller viewing claimed leg */}
        {isSeller && isClaimed && (
          <div className="space-y-3">
            {leg.buyer && (
              <div className="p-3 bg-surface-900 rounded-xl">
                <p className="text-xs text-surface-500 mb-2">Claimed by</p>
                <div className="flex items-center gap-2">
                  <img
                    src={leg.buyer.avatar_url || `${AVATAR_PLACEHOLDER}${leg.buyer.full_name}`}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover bg-surface-800"
                  />
                  <span className="text-white text-sm font-medium">{leg.buyer.full_name}</span>
                </div>
              </div>
            )}
            <form action={async () => {
              'use server';
              await confirmHandoff(id);
            }}>
              <button
                type="submit"
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl transition-colors"
              >
                Confirm Handoff
              </button>
            </form>
            <form action={async () => {
              'use server';
              await rejectClaim(id);
            }}>
              <button
                type="submit"
                className="w-full bg-surface-800 hover:bg-surface-700 text-white font-medium py-3 rounded-xl transition-colors"
              >
                Reject Claim
              </button>
            </form>
          </div>
        )}

        {/* Buyer viewing confirmed/in-progress leg */}
        {isBuyer && (isConfirmed || leg.status === 'in_progress') && (
          <div className="p-3 bg-surface-900 rounded-xl text-center">
            <p className="text-sm text-surface-400">Leg Status</p>
            <p className={`text-sm font-medium mt-1 ${STATUS_COLORS[leg.status].split(' ').slice(1).join(' ')}`}>
              {leg.status.charAt(0).toUpperCase() + leg.status.slice(1).replace('_', ' ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
