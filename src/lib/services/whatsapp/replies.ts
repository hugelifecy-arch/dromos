// Greek reply templates for the WhatsApp bot.
//
// Design rules (from spec §2, §5):
// - Greek first. English is the fallback only when the driver's profile.locale
//   says so. The target audience is 50+ Greek-Cypriot owner-operators.
// - Keep messages under ~320 chars so they render as a single WhatsApp bubble
//   on a 6-year-old Android screen.
// - Every outbound prompt ends with the accepted reply tokens in parentheses,
//   e.g. "(ΝΑΙ/ΟΧΙ)". No guessing what to type.
// - Never say "ride-share" or "carpool". This is an empty-leg marketplace for
//   licensed drivers only.

import type { PostLegData } from './parser';

export type BotLocale = 'el' | 'en';

export function consentPrompt(locale: BotLocale = 'el'): string {
  return locale === 'el'
    ? 'Καλώς ήρθες στο Dromos. Αυτή η γραμμή είναι για αδειοδοτημένους οδηγούς ταξί.\n\n' +
        'Στέλνοντας "ΝΑΙ" συμφωνείς να επεξεργαστούμε τα μηνύματά σου για να δημοσιεύουμε άδεια σκέλη. ' +
        'Γράψε "ΔΙΑΓΡΑΦΗ" ανά πάσα στιγμή για να αποσυρθείς.\n\n' +
        'Απαντάς (ΝΑΙ/ΔΙΑΓΡΑΦΗ);'
    : 'Welcome to Dromos. This line is for licensed taxi drivers only.\n\n' +
        'Reply "YES" to agree we can process your messages to publish empty legs. ' +
        'Reply "STOP" any time to opt out.\n\n' +
        'Your answer (YES/STOP)?';
}

export function optedOutReply(locale: BotLocale = 'el'): string {
  return locale === 'el'
    ? 'Σε αποσύραμε. Δεν θα ξαναλάβεις μηνύματα. Γράψε "ΕΓΓΡΑΦΗ" για να επανέλθεις.'
    : 'You are opted out. No further messages will be sent. Text "START" to re-subscribe.';
}

export function optedInReply(locale: BotLocale = 'el'): string {
  return locale === 'el'
    ? 'Ευχαριστούμε. Είσαι πλέον εγγεγραμμένος.\n\n' +
        'Στείλε το σκέλος σου σε μια γραμμή, π.χ.:\n' +
        'Λάρνακα → Λεμεσός 18:30 €25\n\n' +
        'Γράψε "ΒΟΗΘΕΙΑ" για οδηγίες.'
    : 'Thanks, you are registered.\n\n' +
        'Send your leg in one line, e.g.:\n' +
        'Larnaca → Limassol 18:30 €25\n\n' +
        'Text "HELP" for instructions.';
}

export function notVerifiedReply(locale: BotLocale = 'el'): string {
  return locale === 'el'
    ? 'Ο αριθμός σου δεν συνδέεται με επαληθευμένο προφίλ οδηγού. ' +
        'Μπες στο Dromos με τον λογαριασμό σου και πρόσθεσε αυτό το νούμερο στο προφίλ, και μετά γράψε "ΕΛΕΓΧΟΣ".'
    : 'Your number is not linked to a verified driver profile. ' +
        'Log in to Dromos, add this number to your profile, then text "CHECK".';
}

export function helpReply(locale: BotLocale = 'el'): string {
  return locale === 'el'
    ? 'Γράψε το σκέλος σου σε μια γραμμή:\n' +
        '«Λάρνακα → Λεμεσός 18:30 €25»\n\n' +
        'Άλλες εντολές:\n' +
        'ΝΑΙ / ΟΧΙ — επιβεβαίωση\n' +
        'ΒΟΗΘΕΙΑ — αυτό το μήνυμα\n' +
        'ΔΙΑΓΡΑΦΗ — αποσύρση (GDPR)'
    : 'Send your leg in one line:\n' +
        '"Larnaca → Limassol 18:30 €25"\n\n' +
        'Other commands:\n' +
        'YES / NO — confirm\n' +
        'HELP — this message\n' +
        'STOP — opt out (GDPR)';
}

export function unknownReply(locale: BotLocale = 'el'): string {
  return locale === 'el'
    ? 'Δεν κατάλαβα. Γράψε π.χ. «Λάρνακα → Λεμεσός 18:30 €25» ή "ΒΟΗΘΕΙΑ".'
    : 'I did not understand. Try e.g. "Larnaca → Limassol 18:30 €25" or "HELP".';
}

export function missingTimeReply(locale: BotLocale = 'el'): string {
  return locale === 'el'
    ? 'Δεν βρήκα ώρα. Στείλε ξανά μαζί με την ώρα αναχώρησης, π.χ. «... 18:30».'
    : 'I did not find a time. Send again including the departure time, e.g. "... 18:30".';
}

export function missingPriceReply(draft: PostLegData, locale: BotLocale = 'el'): string {
  const when = formatLocalTime(draft.departureLocal.hour, draft.departureLocal.minute);
  return locale === 'el'
    ? `Κατάλαβα ${draft.originRaw} → ${draft.destinationRaw} στις ${when}. ` +
        `Πόσο ζητάς; Γράψε π.χ. «€25».`
    : `Got ${draft.originRaw} → ${draft.destinationRaw} at ${when}. ` +
        `What price? Reply e.g. "€25".`;
}

// --- Pricing-aware confirmation prompts ---

export interface ConfirmationContext {
  data: PostLegData;
  departureIso: string;           // absolute ISO, resolved to Cyprus-local time
  regulatedMeterEur: number;
  ceilingEur: number;
  floorEur: number;
  askingPriceEur: number;
}

export function confirmationPrompt(
  ctx: ConfirmationContext,
  locale: BotLocale = 'el',
): string {
  const { data, askingPriceEur, regulatedMeterEur, ceilingEur } = ctx;
  const when = formatLocalTime(data.departureLocal.hour, data.departureLocal.minute);
  const day = data.departureLocal.dayOffset === 0 ? 'σήμερα' : 'αύριο';
  const dayEn = data.departureLocal.dayOffset === 0 ? 'today' : 'tomorrow';
  const discount = Math.round(((regulatedMeterEur - askingPriceEur) / regulatedMeterEur) * 100);

  return locale === 'el'
    ? `Κατάλαβα:\n` +
        `${data.originRaw} → ${data.destinationRaw}\n` +
        `${day} ${when} · €${askingPriceEur.toFixed(2)}\n\n` +
        `(Ταρίφα μετρητή €${regulatedMeterEur.toFixed(2)}, έκπτωση ${discount}%, ` +
        `νόμιμο ανώτατο €${ceilingEur.toFixed(2)}.)\n\n` +
        `Επιβεβαιώνεις; (ΝΑΙ/ΟΧΙ)`
    : `Got it:\n` +
        `${data.originRaw} → ${data.destinationRaw}\n` +
        `${dayEn} ${when} · €${askingPriceEur.toFixed(2)}\n\n` +
        `(Meter €${regulatedMeterEur.toFixed(2)}, discount ${discount}%, legal cap €${ceilingEur.toFixed(2)}.)\n\n` +
        `Confirm? (YES/NO)`;
}

export function priceAboveCeilingReply(
  askingEur: number,
  ceilingEur: number,
  locale: BotLocale = 'el',
): string {
  return locale === 'el'
    ? `Η τιμή €${askingEur.toFixed(2)} υπερβαίνει το νόμιμο ανώτατο (€${ceilingEur.toFixed(2)} = 90% της ταρίφας). ` +
        `Στείλε ξανά με μικρότερη τιμή.`
    : `€${askingEur.toFixed(2)} exceeds the legal cap (€${ceilingEur.toFixed(2)} = 90% of the meter). ` +
        `Send again with a lower price.`;
}

export function priceBelowFloorReply(
  askingEur: number,
  floorEur: number,
  locale: BotLocale = 'el',
): string {
  return locale === 'el'
    ? `Η τιμή €${askingEur.toFixed(2)} είναι κάτω από το κατώτατο (€${floorEur.toFixed(2)} = 40% της ταρίφας). ` +
        `Στείλε ξανά με μεγαλύτερη τιμή.`
    : `€${askingEur.toFixed(2)} is below the floor (€${floorEur.toFixed(2)} = 40% of the meter). ` +
        `Send again with a higher price.`;
}

export function noMeterRateReply(locale: BotLocale = 'el'): string {
  return locale === 'el'
    ? 'Δεν έχω ταρίφα για αυτή τη διαδρομή ακόμη. Αναφέρεται στην εξυπηρέτηση.'
    : 'I do not have a regulated meter rate for that route yet. Logged for admin review.';
}

export function publishedReply(
  legId: string,
  askingPriceEur: number,
  appUrl: string,
  locale: BotLocale = 'el',
): string {
  const url = `${appUrl.replace(/\/$/, '')}/app/rides/${legId}`;
  return locale === 'el'
    ? `Δημοσιεύτηκε. ✔\n` +
        `Τιμή €${askingPriceEur.toFixed(2)}\n` +
        `${url}`
    : `Published. ✔\n` +
        `Price €${askingPriceEur.toFixed(2)}\n` +
        `${url}`;
}

export function rejectedDraftReply(locale: BotLocale = 'el'): string {
  return locale === 'el'
    ? 'Εντάξει, ακυρώθηκε. Στείλε ξανά το σκέλος ή γράψε "ΒΟΗΘΕΙΑ".'
    : 'OK, cancelled. Send the leg again or text "HELP".';
}

export function errorReply(locale: BotLocale = 'el'): string {
  return locale === 'el'
    ? 'Κάτι πήγε στραβά. Δοκίμασε ξανά σε λίγο.'
    : 'Something went wrong. Please try again shortly.';
}

// --- Voice (Sprint 12) -------------------------------------------------

export function voiceDisabledReply(locale: BotLocale = 'el'): string {
  return locale === 'el'
    ? 'Τα φωνητικά μηνύματα δεν είναι ακόμη διαθέσιμα. ' +
        'Στείλε γραπτά, π.χ. «Λάρνακα → Λεμεσός 18:30 €25».'
    : 'Voice notes are not available yet. ' +
        'Send text instead, e.g. "Larnaca → Limassol 18:30 €25".';
}

export function voiceTranscriptionFailedReply(locale: BotLocale = 'el'): string {
  return locale === 'el'
    ? 'Δεν μπόρεσα να ακούσω το φωνητικό. Στείλε γραπτό μήνυμα ή δοκίμασε ξανά.'
    : 'I could not hear the voice note. Send a text message or try again.';
}

export function voiceExtractionFailedReply(
  transcript: string,
  locale: BotLocale = 'el',
): string {
  const quoted = transcript.length > 120 ? transcript.slice(0, 117) + '…' : transcript;
  return locale === 'el'
    ? `Άκουσα: «${quoted}», αλλά δεν κατάλαβα διαδρομή + ώρα. ` +
        `Στείλε γραπτά π.χ. «Λάρνακα → Λεμεσός 18:30 €25».`
    : `Heard: "${quoted}" — but could not pin down route + time. ` +
        `Send text, e.g. "Larnaca → Limassol 18:30 €25".`;
}

// --------------------------------------------------------------------------
// Formatting helpers
// --------------------------------------------------------------------------

function formatLocalTime(h: number, m: number): string {
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

// TwiML envelope. Twilio accepts Content-Type: text/xml; we keep it minimal.
export function twiml(body: string): string {
  const safe = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
}

export function emptyTwiml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
}
