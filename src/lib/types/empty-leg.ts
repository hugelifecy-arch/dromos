// Empty Leg Types - Core marketplace entity

export type LegType = 'standard' | 'airport_inbound' | 'airport_outbound' | 'long_distance' | 'repositioning';
export type LuggageCapacity = 'none' | 'small' | 'medium' | 'large';
export type LegStatus = 'open' | 'claimed' | 'confirmed' | 'in_progress' | 'completed' | 'disputed' | 'cancelled' | 'expired';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface EmptyLeg {
  id: string;
  seller_id: string;
  buyer_id: string | null;

  // Route
  origin: string;
  origin_lat: number | null;
  origin_lng: number | null;
  destination: string;
  destination_lat: number | null;
  destination_lng: number | null;

  // Timing
  departure_datetime: string;
  is_time_flexible: boolean;

  // Pricing
  asking_price: number;
  currency: string;

  // Classification
  leg_type: LegType;
  passenger_capacity: number;
  luggage_capacity: LuggageCapacity;

  // Passenger context
  has_passenger: boolean;
  passenger_count: number | null;
  passenger_name: string | null;
  passenger_phone: string | null;
  special_requirements: string | null;

  // Notes
  notes: string | null;

  // Status
  status: LegStatus;

  // Timestamps
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  expired_at: string | null;

  // Joined data (optional, for display)
  seller?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    rating: number;
    completion_rate: number;
  };
  buyer?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
}

export interface DriverVerification {
  id: string;
  user_id: string;
  licence_number: string;
  licence_district: 'nicosia' | 'limassol' | 'larnaca' | 'paphos' | 'famagusta';
  taxi_type: 'urban' | 'rural' | 'tourist' | 'minibus';
  licence_photo_front_url: string | null;
  licence_photo_back_url: string | null;
  vehicle_plate: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_colour: string | null;
  vehicle_seats: number;
  wheelchair_accessible: boolean;
  verification_status: VerificationStatus;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  preferred_districts: string[] | null;
  language_preference: 'en' | 'el' | 'tr';
  created_at: string;
  updated_at: string;
}

export interface AirportQueueListing {
  id: string;
  airport: 'LCA' | 'PFO';
  seller_id: string;
  buyer_id: string | null;
  estimated_position: number;
  asking_price: number;
  status: 'open' | 'claimed' | 'completed' | 'expired';
  created_at: string;
  expires_at: string;
}

// Form types for posting a leg
export interface PostLegFormData {
  origin: string;
  destination: string;
  leg_type: LegType;
  departure_datetime: string;
  is_time_flexible: boolean;
  passenger_capacity: number;
  luggage_capacity: LuggageCapacity;
  asking_price: number;
  has_passenger: boolean;
  passenger_count?: number;
  passenger_name?: string;
  passenger_phone?: string;
  special_requirements?: string;
  notes?: string;
}
