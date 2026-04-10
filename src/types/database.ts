export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type RideStatus = 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type SubscriptionTier = 'free' | 'plus' | 'pro';
export type TransactionType = 'ride_payment' | 'commission' | 'payout' | 'subscription' | 'refund' | 'bonus';
export type LuggageSize = 'small' | 'medium' | 'large';
export type CorporateRole = 'admin' | 'manager' | 'member';
export type AdminRole = 'admin' | 'super_admin';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  bio: string | null;
  date_of_birth: string | null;
  is_driver: boolean;
  is_verified: boolean;
  rating_avg: number;
  rating_count: number;
  total_rides: number;
  total_drives: number;
  car_make: string | null;
  car_model: string | null;
  car_year: number | null;
  car_color: string | null;
  car_plate: string | null;
  locale: 'el' | 'en';
  created_at: string;
  updated_at: string;
}

export interface Ride {
  id: string;
  driver_id: string;
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  departure_time: string;
  arrival_time_est: string | null;
  seats_total: number;
  seats_available: number;
  price_per_seat: number;
  currency: string;
  status: RideStatus;
  notes: string | null;
  is_recurring: boolean;
  recurrence_days: number[];
  allow_detours: boolean;
  max_detour_minutes: number;
  luggage_size: LuggageSize;
  created_at: string;
  updated_at: string;
  // Joined
  driver?: Profile;
}

export interface Booking {
  id: string;
  ride_id: string;
  passenger_id: string;
  seats_booked: number;
  status: BookingStatus;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  total_price: number;
  created_at: string;
  updated_at: string;
  // Joined
  ride?: Ride;
  passenger?: Profile;
}

export interface Conversation {
  id: string;
  ride_id: string | null;
  created_at: string;
  // Joined
  participants?: ConversationParticipant[];
  messages?: Message[];
  last_message?: Message;
}

export interface ConversationParticipant {
  conversation_id: string;
  user_id: string;
  last_read_at: string;
  // Joined
  profile?: Profile;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  // Joined
  sender?: Profile;
}

export interface Review {
  id: string;
  booking_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  // Joined
  reviewer?: Profile;
  reviewee?: Profile;
}

export interface FeedPost {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  ride_id: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  // Joined
  author?: Profile;
  ride?: Ride;
  has_liked?: boolean;
}

export interface FeedComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  // Joined
  author?: Profile;
}

export interface Subscription {
  id: string;
  user_id: string;
  tier: SubscriptionTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  booking_id: string | null;
  type: TransactionType;
  amount: number;
  currency: string;
  description: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
}

export interface CorporateAccount {
  id: string;
  name: string;
  domain: string;
  logo_url: string | null;
  admin_id: string | null;
  max_employees: number;
  monthly_budget: number | null;
  stripe_customer_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CorporateMember {
  corporate_id: string;
  user_id: string;
  role: CorporateRole;
  monthly_allowance: number;
  joined_at: string;
  // Joined
  profile?: Profile;
  corporate?: CorporateAccount;
}

export interface FlightWatch {
  id: string;
  user_id: string;
  flight_number: string;
  flight_date: string;
  airline: string | null;
  origin_airport: string | null;
  destination_airport: string | null;
  scheduled_arrival: string | null;
  actual_arrival: string | null;
  status: string;
  auto_create_ride: boolean;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & Pick<Profile, 'id' | 'email' | 'full_name'>; Update: Partial<Profile> };
      rides: { Row: Ride; Insert: Omit<Ride, 'id' | 'created_at' | 'updated_at' | 'status' | 'seats_available' | 'driver'>; Update: Partial<Ride> };
      bookings: { Row: Booking; Insert: Omit<Booking, 'id' | 'created_at' | 'updated_at' | 'status'>; Update: Partial<Booking> };
      conversations: { Row: Conversation; Insert: Partial<Conversation>; Update: Partial<Conversation> };
      conversation_participants: { Row: ConversationParticipant; Insert: Pick<ConversationParticipant, 'conversation_id' | 'user_id'>; Update: Partial<ConversationParticipant> };
      messages: { Row: Message; Insert: Pick<Message, 'conversation_id' | 'sender_id' | 'body'>; Update: Partial<Message> };
      reviews: { Row: Review; Insert: Omit<Review, 'id' | 'created_at'>; Update: Partial<Review> };
      feed_posts: { Row: FeedPost; Insert: Pick<FeedPost, 'author_id' | 'content'> & Partial<FeedPost>; Update: Partial<FeedPost> };
      feed_likes: { Row: { post_id: string; user_id: string; created_at: string }; Insert: { post_id: string; user_id: string }; Update: never };
      feed_comments: { Row: FeedComment; Insert: Pick<FeedComment, 'post_id' | 'author_id' | 'content'>; Update: Partial<FeedComment> };
      subscriptions: { Row: Subscription; Insert: Partial<Subscription> & Pick<Subscription, 'user_id'>; Update: Partial<Subscription> };
      transactions: { Row: Transaction; Insert: Omit<Transaction, 'id' | 'created_at'>; Update: Partial<Transaction> };
      corporate_accounts: { Row: CorporateAccount; Insert: Omit<CorporateAccount, 'id' | 'created_at'>; Update: Partial<CorporateAccount> };
      corporate_members: { Row: CorporateMember; Insert: Pick<CorporateMember, 'corporate_id' | 'user_id'>; Update: Partial<CorporateMember> };
      flight_watches: { Row: FlightWatch; Insert: Omit<FlightWatch, 'id' | 'created_at'>; Update: Partial<FlightWatch> };
    };
  };
}
