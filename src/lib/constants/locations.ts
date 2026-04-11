// Cyprus Locations Master File
// Used for all location autocomplete inputs across the platform

export const CYPRUS_CITIES = [
  'Nicosia',
  'Limassol',
  'Larnaca',
  'Paphos',
  'Ayia Napa',
  'Protaras',
  'Paralimni',
  'Polis Chrysochous',
] as const;

export const CYPRUS_AIRPORTS = [
  { name: 'Larnaca International Airport', code: 'LCA', city: 'Larnaca' },
  { name: 'Paphos International Airport', code: 'PFO', city: 'Paphos' },
] as const;

export const CYPRUS_KEY_LOCATIONS = [
  'Limassol Port',
  'Limassol Old Port',
  'Nicosia General Hospital',
  'Larnaca Port',
  'Paphos Harbour',
  'Troodos Square',
  'Platres',
  'Nicosia, Eleftheria Square',
  'Larnaca Airport (LCA)',
  'Paphos Airport (PFO)',
] as const;

export const CYPRUS_DISTRICTS = [
  'Nicosia District',
  'Limassol District',
  'Larnaca District',
  'Paphos District',
  'Famagusta District',
] as const;

// Combined list for autocomplete inputs
export const CYPRUS_ALL_LOCATIONS: string[] = [
  ...CYPRUS_CITIES,
  ...CYPRUS_KEY_LOCATIONS,
  ...CYPRUS_AIRPORTS.map(a => `${a.name} (${a.code})`),
];

export type CyprusCity = typeof CYPRUS_CITIES[number];
export type CyprusDistrict = typeof CYPRUS_DISTRICTS[number];

// Licence districts for driver verification
export const LICENCE_DISTRICTS = ['nicosia', 'limassol', 'larnaca', 'paphos', 'famagusta'] as const;
export type LicenceDistrict = typeof LICENCE_DISTRICTS[number];

// Taxi types per Cyprus regulation
export const TAXI_TYPES = ['urban', 'rural', 'tourist', 'minibus'] as const;
export type TaxiType = typeof TAXI_TYPES[number];

// Phone format
export const CYPRUS_PHONE_PREFIX = '+357';
export const CYPRUS_PHONE_REGEX = /^\+357\d{8}$/;
export const CYPRUS_PLATE_REGEX = /^[A-Z]{2,3}\s?\d{3}$/;
