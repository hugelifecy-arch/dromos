export type Locale = 'el' | 'en';

const translations = {
  // Navigation
  'nav.feed': { en: 'Feed', el: 'Ροή' },
  'nav.rides': { en: 'Rides', el: 'Διαδρομές' },
  'nav.post': { en: 'Post', el: 'Δημοσίευση' },
  'nav.messages': { en: 'Messages', el: 'Μηνύματα' },
  'nav.profile': { en: 'Profile', el: 'Προφίλ' },

  // Auth
  'auth.login': { en: 'Sign In', el: 'Σύνδεση' },
  'auth.signup': { en: 'Sign Up', el: 'Εγγραφή' },
  'auth.logout': { en: 'Sign Out', el: 'Αποσύνδεση' },
  'auth.email': { en: 'Email', el: 'Email' },
  'auth.password': { en: 'Password', el: 'Κωδικός' },
  'auth.continue_google': { en: 'Continue with Google', el: 'Συνέχεια με Google' },
  'auth.onboarding.title': { en: 'Complete your profile', el: 'Ολοκλήρωσε το προφίλ σου' },
  'auth.onboarding.name': { en: 'Full Name', el: 'Ονοματεπώνυμο' },
  'auth.onboarding.phone': { en: 'Phone Number', el: 'Τηλέφωνο' },
  'auth.onboarding.bio': { en: 'Short Bio', el: 'Σύντομο βιογραφικό' },
  'auth.onboarding.driver': { en: 'I want to offer rides', el: 'Θέλω να προσφέρω διαδρομές' },

  // Rides
  'ride.from': { en: 'From', el: 'Από' },
  'ride.to': { en: 'To', el: 'Προς' },
  'ride.when': { en: 'When', el: 'Πότε' },
  'ride.seats': { en: 'Seats', el: 'Θέσεις' },
  'ride.price': { en: 'Price', el: 'Τιμή' },
  'ride.per_seat': { en: 'per seat', el: 'ανά θέση' },
  'ride.book': { en: 'Book Ride', el: 'Κράτηση' },
  'ride.post': { en: 'Post a Ride', el: 'Δημοσίευση Διαδρομής' },
  'ride.search': { en: 'Search Rides', el: 'Αναζήτηση Διαδρομών' },
  'ride.no_results': { en: 'No rides found', el: 'Δεν βρέθηκαν διαδρομές' },
  'ride.seats_left': { en: 'seats left', el: 'θέσεις απομένουν' },
  'ride.details': { en: 'Ride Details', el: 'Λεπτομέρειες Διαδρομής' },

  // Feed
  'feed.title': { en: 'Community Feed', el: 'Κοινότητα' },
  'feed.whats_new': { en: "What's on your mind?", el: 'Τι σκέφτεσαι;' },
  'feed.post': { en: 'Post', el: 'Δημοσίευση' },
  'feed.like': { en: 'Like', el: 'Like' },
  'feed.comment': { en: 'Comment', el: 'Σχόλιο' },

  // Messages
  'messages.title': { en: 'Messages', el: 'Μηνύματα' },
  'messages.new': { en: 'New Message', el: 'Νέο Μήνυμα' },
  'messages.placeholder': { en: 'Type a message...', el: 'Γράψε ένα μήνυμα...' },
  'messages.empty': { en: 'No messages yet', el: 'Δεν υπάρχουν μηνύματα' },

  // Profile
  'profile.title': { en: 'Profile', el: 'Προφίλ' },
  'profile.edit': { en: 'Edit Profile', el: 'Επεξεργασία' },
  'profile.rides_taken': { en: 'Rides Taken', el: 'Διαδρομές' },
  'profile.rides_given': { en: 'Rides Given', el: 'Οδηγήσεις' },
  'profile.rating': { en: 'Rating', el: 'Βαθμολογία' },
  'profile.verified': { en: 'Verified', el: 'Επιβεβαιωμένο' },
  'profile.member_since': { en: 'Member since', el: 'Μέλος από' },

  // Earnings
  'earnings.title': { en: 'Earnings', el: 'Κέρδη' },
  'earnings.total': { en: 'Total Earned', el: 'Σύνολο Κερδών' },
  'earnings.pending': { en: 'Pending', el: 'Εκκρεμότητα' },
  'earnings.this_month': { en: 'This Month', el: 'Αυτόν τον Μήνα' },

  // Subscription
  'upgrade.title': { en: 'Upgrade Your Plan', el: 'Αναβάθμιση Πλάνου' },
  'upgrade.free': { en: 'Free', el: 'Δωρεάν' },
  'upgrade.plus': { en: 'Plus', el: 'Plus' },
  'upgrade.pro': { en: 'Pro', el: 'Pro' },
  'upgrade.current': { en: 'Current Plan', el: 'Τρέχον Πλάνο' },
  'upgrade.select': { en: 'Select Plan', el: 'Επιλογή' },

  // Corporate
  'corporate.title': { en: 'Corporate Account', el: 'Εταιρικός Λογαριασμός' },
  'corporate.members': { en: 'Team Members', el: 'Μέλη Ομάδας' },
  'corporate.budget': { en: 'Monthly Budget', el: 'Μηνιαίος Προϋπολογισμός' },

  // Flights
  'flights.title': { en: 'Flight Tracker', el: 'Παρακολούθηση Πτήσεων' },
  'flights.add': { en: 'Track Flight', el: 'Παρακολούθηση Πτήσης' },
  'flights.number': { en: 'Flight Number', el: 'Αριθμός Πτήσης' },
  'flights.date': { en: 'Date', el: 'Ημερομηνία' },
  'flights.status': { en: 'Status', el: 'Κατάσταση' },
  'flights.auto_ride': { en: 'Auto-create ride on arrival', el: 'Αυτόματη δημιουργία διαδρομής' },

  // General
  'general.save': { en: 'Save', el: 'Αποθήκευση' },
  'general.cancel': { en: 'Cancel', el: 'Ακύρωση' },
  'general.loading': { en: 'Loading...', el: 'Φόρτωση...' },
  'general.error': { en: 'Something went wrong', el: 'Κάτι πήγε στραβά' },
  'general.empty': { en: 'Nothing here yet', el: 'Τίποτα ακόμα' },

  // Landing
  'landing.hero': { en: 'Share the road, share the cost', el: 'Μοιράσου τη διαδρομή, μοιράσου το κόστος' },
  'landing.subtitle': { en: 'Connect with drivers and passengers heading your way. Save money, reduce traffic, meet great people.', el: 'Βρες οδηγούς και συνεπιβάτες στην κατεύθυνσή σου. Εξοικονόμησε, μείωσε την κίνηση, γνώρισε ανθρώπους.' },
  'landing.cta': { en: 'Get Started', el: 'Ξεκίνα Τώρα' },
} as const;

type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, locale: Locale = 'el'): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[locale] || entry.en;
}

export function useTranslation(locale: Locale = 'el') {
  return {
    t: (key: TranslationKey) => t(key, locale),
    locale,
  };
}
