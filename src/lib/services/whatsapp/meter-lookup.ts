// Adapter: Supabase-backed MeterLookup for the pricing service.
//
// The pricing service is synchronous (see src/lib/services/pricing.ts), so
// we fetch the single rate we need for (origin, destination, departure) and
// pass it back as a closure. Caller is responsible for awaiting the fetch
// before invoking computePricing.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { LicenceDistrict } from '@/lib/constants/locations';
import type { MeterLookup, MeterRate } from '@/lib/services/pricing';

export async function fetchMeterRate(
  supabase: SupabaseClient,
  origin: LicenceDistrict,
  destination: LicenceDistrict,
  departure: Date,
): Promise<MeterRate | null> {
  const departureDate = departure.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('regulated_meter_rates')
    .select('origin_district, destination_district, base_fare_eur, per_km_rate_eur, distance_km, night_multiplier, effective_from, effective_to')
    .eq('origin_district', origin)
    .eq('destination_district', destination)
    .lte('effective_from', departureDate)
    .order('effective_from', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const row = data[0];

  // Respect effective_to if set.
  if (row.effective_to && row.effective_to < departureDate) return null;

  return {
    origin: row.origin_district as LicenceDistrict,
    destination: row.destination_district as LicenceDistrict,
    baseFareEur: Number(row.base_fare_eur),
    perKmRateEur: Number(row.per_km_rate_eur),
    distanceKm: Number(row.distance_km),
    nightMultiplier: Number(row.night_multiplier),
  };
}

// Build a synchronous MeterLookup around a pre-fetched rate. Matches the
// signature of pricing.ts so callers can swap implementations freely.
export function staticMeterLookup(rate: MeterRate | null): MeterLookup {
  return () => rate;
}
