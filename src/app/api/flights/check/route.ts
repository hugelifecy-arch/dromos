import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// Known airline prefixes (Cyprus-relevant carriers)
const AIRLINE_MAP: Record<string, string> = {
  'CY': 'Cyprus Airways',
  'A3': 'Aegean Airlines',
  'OA': 'Olympic Air',
  'W6': 'Wizz Air',
  'FR': 'Ryanair',
  'U2': 'easyJet',
  'LH': 'Lufthansa',
  'BA': 'British Airways',
  'TK': 'Turkish Airlines',
  'EK': 'Emirates',
  'SU': 'Aeroflot',
  'S7': 'S7 Airlines',
  'EL': 'Ellinair',
  'PC': 'Pegasus Airlines',
  'LS': 'Jet2',
  'BY': 'TUI Airways',
  'DE': 'Condor',
  'VY': 'Vueling',
  'AF': 'Air France',
  'SK': 'SKY express',
  'QS': 'Smartwings',
  'GQ': 'TUS Airways',
};

// Common routes to Cyprus — used for mock origin when no real API
const MOCK_ORIGINS: Record<string, string> = {
  'CY': 'ATH', 'A3': 'ATH', 'OA': 'ATH', 'EL': 'SKG',
  'FR': 'STN', 'U2': 'LGW', 'BA': 'LHR', 'LS': 'MAN',
  'W6': 'LTN', 'LH': 'FRA', 'TK': 'IST', 'EK': 'DXB',
  'SU': 'SVO', 'S7': 'DME', 'PC': 'SAW', 'SK': 'ATH',
  'GQ': 'ATH', 'DE': 'FRA', 'BY': 'MAN', 'QS': 'PRG',
};

function parseFlightNumber(raw: string): { airline_code: string; number: string; formatted: string } | null {
  const cleaned = raw.replace(/[\s\-\.]/g, '').toUpperCase();
  const match = cleaned.match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])(\d{1,4})$/);
  if (!match) return null;
  return {
    airline_code: match[1],
    number: match[2],
    formatted: `${match[1]} ${match[2]}`,
  };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { flight_number, flight_date } = await request.json();

    if (!flight_number || !flight_date) {
      return NextResponse.json({ error: 'Missing flight_number or flight_date' }, { status: 400 });
    }

    const parsed = parseFlightNumber(flight_number);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid flight number format. Use airline code + number (e.g. A3 612, FR 8341)' },
        { status: 400 }
      );
    }

    const airline = AIRLINE_MAP[parsed.airline_code] || null;
    const origin = MOCK_ORIGINS[parsed.airline_code] || 'ATH';

    // Destination defaults to Larnaca for Cyprus taxi drivers.
    // In production, call AviationStack / FlightAware / AeroDataBox API.
    const destination = 'LCA';

    // Generate a realistic arrival time from the flight number
    const flightNum = parseInt(parsed.number);
    const hour = (flightNum % 14) + 6; // Between 06:00 and 19:59
    const minutes = (flightNum * 7) % 60;
    const scheduledArrival = new Date(`${flight_date}T${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);

    const { data, error } = await supabase
      .from('flight_watches')
      .insert({
        user_id: user.id,
        flight_number: parsed.formatted,
        flight_date,
        airline,
        origin_airport: origin,
        destination_airport: destination,
        scheduled_arrival: scheduledArrival.toISOString(),
        status: 'scheduled',
        auto_create_ride: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Flight watch insert error:', error);
      return NextResponse.json({ error: 'Failed to track flight' }, { status: 500 });
    }

    return NextResponse.json({ flight: data });
  } catch (err) {
    console.error('Flight check error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
