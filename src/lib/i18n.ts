export type Locale = 'el' | 'en';

// Greek-first. The primary audience is the 50+ Greek-Cypriot owner-operator
// driver. English is the secondary locale, retained for tourist-facing flows
// and for Cypriot drivers who prefer it. Every entry lists `el` before `en`.
//
// Vocabulary: this is an empty-leg marketplace for licensed taxi drivers. It
// is NOT a carpool, ride-share, or consumer app. Copy avoids "share the ride",
// "carpool", "seats left", "book a ride", etc. Where a word like "seat" is
// still needed (vehicle capacity), it refers to the vehicle, not the listing.
const translations = {
  // Navigation
  'nav.feed': { el: 'Ροή', en: 'Feed' },
  'nav.legs': { el: 'Άδεια σκέλη', en: 'Empty Legs' },
  'nav.post': { el: 'Δημοσίευση', en: 'Post Leg' },
  'nav.messages': { el: 'Μηνύματα', en: 'Messages' },
  'nav.profile': { el: 'Προφίλ', en: 'Profile' },
  'nav.airport': { el: 'Αεροδρόμιο', en: 'Airport' },
  'nav.earnings': { el: 'Έσοδα', en: 'Earnings' },

  // Auth
  'auth.login': { el: 'Σύνδεση', en: 'Sign In' },
  'auth.signup': { el: 'Εγγραφή', en: 'Sign Up' },
  'auth.logout': { el: 'Αποσύνδεση', en: 'Sign Out' },
  'auth.email': { el: 'Email', en: 'Email' },
  'auth.password': { el: 'Κωδικός', en: 'Password' },
  'auth.continue_google': { el: 'Συνέχεια με Google', en: 'Continue with Google' },
  'auth.onboarding.title': { el: 'Ολοκλήρωσε το προφίλ οδηγού', en: 'Complete your driver profile' },
  'auth.onboarding.name': { el: 'Ονοματεπώνυμο', en: 'Full Name' },
  'auth.onboarding.phone': { el: 'Τηλέφωνο', en: 'Phone Number' },
  'auth.onboarding.bio': { el: 'Σύντομο βιογραφικό', en: 'Short Bio' },
  'auth.onboarding.driver_only': { el: 'Αυτή η πλατφόρμα είναι μόνο για αδειοδοτημένους οδηγούς ταξί', en: 'This platform is for licensed taxi drivers only' },

  // Empty legs (was "Rides" — drivers list the empty segment they are about
  // to drive, another licensed driver claims it. No passengers sign up here.)
  'leg.from': { el: 'Από', en: 'From' },
  'leg.to': { el: 'Προς', en: 'To' },
  'leg.when': { el: 'Αναχώρηση', en: 'Departure' },
  'leg.vehicle_capacity': { el: 'Θέσεις οχήματος', en: 'Vehicle capacity' },
  'leg.price': { el: 'Τιμή σκέλους', en: 'Leg price' },
  'leg.claim': { el: 'Ανάληψη σκέλους', en: 'Claim leg' },
  'leg.post': { el: 'Δημοσίευσε άδειο σκέλος', en: 'Post an empty leg' },
  'leg.search': { el: 'Αναζήτηση άδειων σκελών', en: 'Browse empty legs' },
  'leg.no_results': { el: 'Δεν υπάρχουν διαθέσιμα σκέλη', en: 'No empty legs available' },
  'leg.details': { el: 'Λεπτομέρειες σκέλους', en: 'Leg details' },
  'leg.regulated_meter': { el: 'Ταρίφα μετρητή', en: 'Regulated meter reference' },
  'leg.discount_voucher': { el: 'Έκπτωση οδηγού', en: 'Driver-set discount' },
  'leg.your_asking': { el: 'Η τιμή σου', en: 'Your asking price' },

  // Feed
  'feed.title': { el: 'Ροή συναδέλφων', en: 'Driver Feed' },
  'feed.whats_new': { el: 'Τι νέα από τον δρόμο;', en: "What's happening on the road?" },
  'feed.post': { el: 'Δημοσίευση', en: 'Post' },
  'feed.like': { el: 'Μου αρέσει', en: 'Like' },
  'feed.comment': { el: 'Σχόλιο', en: 'Comment' },

  // Messages
  'messages.title': { el: 'Μηνύματα', en: 'Messages' },
  'messages.new': { el: 'Νέο μήνυμα', en: 'New message' },
  'messages.placeholder': { el: 'Γράψε ένα μήνυμα…', en: 'Type a message…' },
  'messages.empty': { el: 'Κανένα μήνυμα ακόμη', en: 'No messages yet' },

  // Profile
  'profile.title': { el: 'Προφίλ οδηγού', en: 'Driver profile' },
  'profile.edit': { el: 'Επεξεργασία', en: 'Edit profile' },
  'profile.legs_completed': { el: 'Ολοκληρωμένα σκέλη', en: 'Completed legs' },
  'profile.legs_posted': { el: 'Δημοσιευμένα σκέλη', en: 'Posted legs' },
  'profile.rating': { el: 'Βαθμολογία', en: 'Rating' },
  'profile.verified': { el: 'Επιβεβαιωμένη άδεια', en: 'Licence verified' },
  'profile.member_since': { el: 'Μέλος από', en: 'Member since' },

  // Earnings
  'earnings.title': { el: 'Έσοδα', en: 'Earnings' },
  'earnings.total': { el: 'Σύνολο εσόδων', en: 'Total earned' },
  'earnings.pending': { el: 'Σε εκκρεμότητα', en: 'Pending' },
  'earnings.this_month': { el: 'Αυτόν τον μήνα', en: 'This month' },
  'earnings.tax_export': { el: 'Εξαγωγή για λογιστή', en: 'Export for accountant' },

  // Subscription — "no commission" is the anchor message.
  'upgrade.title': { el: 'Αναβάθμιση πλάνου', en: 'Upgrade your plan' },
  'upgrade.free': { el: 'Δωρεάν', en: 'Free' },
  'upgrade.plus': { el: 'Plus', en: 'Plus' },
  'upgrade.pro': { el: 'Pro', en: 'Pro' },
  'upgrade.current': { el: 'Τρέχον πλάνο', en: 'Current plan' },
  'upgrade.select': { el: 'Επιλογή', en: 'Select plan' },
  'upgrade.no_commission': { el: 'Καμία προμήθεια. Πάγια συνδρομή, τίποτα περισσότερο.', en: 'No commission. Flat subscription, nothing else.' },

  // Corporate
  'corporate.title': { el: 'Εταιρικός λογαριασμός', en: 'Corporate account' },
  'corporate.members': { el: 'Μέλη ομάδας', en: 'Team members' },
  'corporate.budget': { el: 'Μηνιαίος προϋπολογισμός', en: 'Monthly budget' },

  // Flights
  'flights.title': { el: 'Παρακολούθηση πτήσεων', en: 'Flight tracker' },
  'flights.add': { el: 'Παρακολούθηση πτήσης', en: 'Track flight' },
  'flights.number': { el: 'Αριθμός πτήσης', en: 'Flight number' },
  'flights.date': { el: 'Ημερομηνία', en: 'Date' },
  'flights.status': { el: 'Κατάσταση', en: 'Status' },
  'flights.auto_leg': { el: 'Αυτόματη πρόταση σκέλους στην άφιξη', en: 'Suggest a leg on arrival' },

  // General
  'general.save': { el: 'Αποθήκευση', en: 'Save' },
  'general.cancel': { el: 'Ακύρωση', en: 'Cancel' },
  'general.loading': { el: 'Φόρτωση…', en: 'Loading…' },
  'general.error': { el: 'Κάτι πήγε στραβά', en: 'Something went wrong' },
  'general.empty': { el: 'Τίποτα ακόμη', en: 'Nothing here yet' },

  // Landing — Greek-first. Hero is the strategy §2 one-liner verbatim.
  'landing.hero': {
    el: 'Γέμισε το άδειο ταξί σου στον δρόμο της επιστροφής.',
    en: 'Fill your empty taxi on the way back.',
  },
  'landing.subtitle': {
    el: 'Είσαι ήδη στον δρόμο — πληρώσου γι’ αυτόν. Η αγορά άδειων σκελών για αδειοδοτημένους οδηγούς ταξί στην Κύπρο.',
    en: "You're already driving — get paid for it. The empty-leg marketplace for licensed Cyprus taxi drivers.",
  },
  'landing.pillar_income': {
    el: 'Ανακτάς χαμένο εισόδημα, δεν φορτώνεις νέα δουλειά.',
    en: 'Recover lost income, not new work.',
  },
  'landing.pillar_no_commission': {
    el: 'Καμία προμήθεια. Κανένα αφεντικό. Καμία εφαρμογή να σου φωνάζει.',
    en: 'No commission. No boss. No app shouting at you.',
  },
  'landing.pillar_cyprus': {
    el: 'Κυπριακή πλατφόρμα. Τα δεδομένα σου μένουν εδώ.',
    en: 'Cyprus-owned, Cyprus-made. Your data stays here.',
  },
  'landing.cta': { el: 'Ξεκίνα τώρα', en: 'Get Started' },
} as const;

type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, locale: Locale = 'el'): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[locale] || entry.el;
}

export function useTranslation(locale: Locale = 'el') {
  return {
    t: (key: TranslationKey) => t(key, locale),
    locale,
  };
}
