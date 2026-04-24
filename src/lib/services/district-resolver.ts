// Map free-text Cyprus origin/destination strings to a licence district.
//
// Used by the web /api/empty-legs route to feed the pricing engine when the
// driver typed "Larnaca Airport (LCA)" into the form. The bot's inbound
// parser (whatsapp/parser.ts) has its own, richer, accent-insensitive
// matcher for Greek voice/text — we keep this resolver deliberately small
// and ASCII-lowercased because the web form autocomplete is built from
// CYPRUS_ALL_LOCATIONS in constants/locations.ts.
//
// If we ever grow a third caller we extract both lexicons into one module.
// Two is fine.
//
// Returns null when no district keyword is found; the caller decides whether
// to fail closed (block the post) or open (skip pricing check and rely on
// the DB CHECK as the backstop).
import type { LicenceDistrict } from '@/lib/constants/locations';

interface Keyword { match: string; district: LicenceDistrict }

const KEYWORDS: Keyword[] = ([
  { match: 'larnaca', district: 'larnaca' },
  { match: 'larnaka', district: 'larnaca' },
  { match: 'lca', district: 'larnaca' },
  { match: 'limassol', district: 'limassol' },
  { match: 'lemesos', district: 'limassol' },
  { match: 'nicosia', district: 'nicosia' },
  { match: 'lefkosia', district: 'nicosia' },
  { match: 'leukosia', district: 'nicosia' },
  { match: 'paphos', district: 'paphos' },
  { match: 'pafos', district: 'paphos' },
  { match: 'pfo', district: 'paphos' },
  { match: 'famagusta', district: 'famagusta' },
  { match: 'ayia napa', district: 'famagusta' },
  { match: 'agia napa', district: 'famagusta' },
  { match: 'protaras', district: 'famagusta' },
  { match: 'paralimni', district: 'famagusta' },
] as Keyword[]).sort((a, b) => b.match.length - a.match.length);

export function resolveDistrictFromText(raw: string): LicenceDistrict | null {
  const needle = (raw ?? '').toLowerCase();
  if (!needle) return null;
  for (const { match, district } of KEYWORDS) {
    if (needle.includes(match)) return district;
  }
  return null;
}
