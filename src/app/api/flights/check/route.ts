import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { flight_number, flight_date } = await request.json();

  if (!flight_number || !flight_date) {
    return NextResponse.json({ error: 'Missing flight_number or flight_date' }, { status: 400 });
  }

  // In production, integrate with a real flight API (e.g. AviationStack, FlightAware)
  // For now, return mock flight data
  const mockFlight = {
    flight_number: flight_number.toUpperCase(),
    flight_date,
    airline: getAirlineFromCode(flight_number),
    origin_airport: 'ATH',
    destination_airport: 'SKG',
    scheduled_arrival: new Date(`${flight_date}T14:30:00`).toISOString(),
    status: 'scheduled',
  };

  // Upsert the flight watch
  const { data, error } = await supabase
    .from('flight_watches')
    .upsert({
      user_id: user.id,
      flight_number: mockFlight.flight_number,
      flight_date: mockFlight.flight_date,
      airline: mockFlight.airline,
      origin_airport: mockFlight.origin_airport,
      destination_airport: mockFlight.destination_airport,
      scheduled_arrival: mockFlight.scheduled_arrival,
      status: mockFlight.status,
    }, {
      onConflict: 'user_id,flight_number,flight_date',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ flight: data });
}

function getAirlineFromCode(flightNumber: string): string {
  const code = flightNumber.substring(0, 2).toUpperCase();
  const airlines: Record<string, string> = {
    'A3': 'Aegean Airlines',
    'OA': 'Olympic Air',
    'FR': 'Ryanair',
    'W6': 'Wizz Air',
    'U2': 'easyJet',
    'LH': 'Lufthansa',
    'BA': 'British Airways',
    'AF': 'Air France',
    'SK': 'SKY express',
  };
  return airlines[code] || 'Unknown Airline';
}
