// Tile-coordinate <-> bbox math for the heatmap endpoint.
//
// The map UI is a slippy-map (MapLibre) talking to GET /api/heatmap/[z]/[x]/[y].
// Tile coords are XYZ (Web Mercator); we convert to a (min_lng, min_lat,
// max_lng, max_lat) bbox in WGS84 so the Supabase RPC `heatmap_drop_density`
// can do PostGIS work in geography(4326).
//
// Reference formulae are the standard slippy-map ones:
//   n = 2^z
//   lon_deg = x / n * 360 - 180
//   lat_rad = atan(sinh(π * (1 - 2 * y / n)))
//   lat_deg = lat_rad * 180 / π
// (https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames)

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export function tileToBBox({ z, x, y }: TileCoord): BBox {
  const n = 2 ** z;
  const minLng = (x / n) * 360 - 180;
  const maxLng = ((x + 1) / n) * 360 - 180;
  const maxLat = tileYToLat(y, n);
  const minLat = tileYToLat(y + 1, n);
  return { minLng, minLat, maxLng, maxLat };
}

function tileYToLat(y: number, n: number): number {
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return (latRad * 180) / Math.PI;
}

// --------------------------------------------------------------------------
// Sanity / safety guards
// --------------------------------------------------------------------------
//
// The RPC enforces its own bbox cap (~50km × 50km equivalent), but we also
// reject obviously bad inputs at the API edge so we never pay for the
// round-trip and ops gets a clean 400 instead of a Postgres error.

export interface ValidatedTile extends TileCoord {}

export class TileValidationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'TileValidationError';
  }
}

const MIN_ZOOM = 6;   // anything zoomed out further covers all of Cyprus + neighbours, no useful detail
const MAX_ZOOM = 14;  // ~9.5m / px at the equator; below this, individual drops aren't anonymisable

export function parseTileParams(params: { z: string; x: string; y: string }): ValidatedTile {
  // parseInt('8.5') silently returns 8, so we require a clean integer string
  // before parsing. Negative integers are allowed at parse time and rejected
  // by the range check below.
  const isInt = (s: string) => /^-?\d+$/.test(s);
  if (!isInt(params.z) || !isInt(params.x) || !isInt(params.y)) {
    throw new TileValidationError('z, x, y must be integers');
  }
  const z = Number.parseInt(params.z, 10);
  const x = Number.parseInt(params.x, 10);
  const y = Number.parseInt(params.y, 10);

  if (z < MIN_ZOOM || z > MAX_ZOOM) {
    throw new TileValidationError(`z must be in [${MIN_ZOOM}, ${MAX_ZOOM}]`);
  }
  const max = 2 ** z;
  if (x < 0 || x >= max || y < 0 || y >= max) {
    throw new TileValidationError(`x, y must be in [0, ${max - 1}]`);
  }
  return { z, x, y };
}

// --------------------------------------------------------------------------
// Heuristic: pick a bin size that gives roughly one bin per pixel-ish at the
// requested zoom. The RPC clamps to [100, 10000] so we don't have to.
// --------------------------------------------------------------------------
// Resolution at the equator is ~156_543 / 2^z metres per pixel; a 256-px tile
// covers ~256 * res metres on a side. Rough rule: bin_size ≈ tile_side / 32
// so each tile aggregates into a 32x32 grid. That's enough granularity for
// the heatmap layer to feel smooth without overloading the network.
//
// We round to the nearest 100m so the bins line up across re-pans.

export function suggestedBinSizeM(z: number): number {
  const tileSideM = 256 * 156_543.03 / 2 ** z;
  const binM = tileSideM / 32;
  const rounded = Math.round(binM / 100) * 100;
  return Math.max(100, Math.min(10_000, rounded));
}
