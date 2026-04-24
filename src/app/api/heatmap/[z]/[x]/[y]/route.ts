// GET /api/heatmap/[z]/[x]/[y]
//
// Returns a GeoJSON FeatureCollection of bin centroids + drop counts for the
// requested slippy-map tile. The map UI loads this lazily as the driver
// pans/zooms; we keep the response small (one Point feature per bin, no
// polygons) so MapLibre's heatmap layer can rasterise client-side.
//
// Why GeoJSON and not vector tiles (MVT): MVT requires a binary encoder we'd
// pull in just for this. The aggregated bin set per tile is small (typically
// <200 features) so JSON is fine for v1; if payload sizes climb we swap the
// transport without touching the SQL.
//
// Auth: requires a signed-in user. The RPC is SECURITY DEFINER and gated to
// the `authenticated` role; we stop unauth requests at the edge for cleaner
// errors and to avoid a Postgres round-trip.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase-server';
import {
  TileValidationError,
  parseTileParams,
  suggestedBinSizeM,
  tileToBBox,
} from '@/lib/services/heatmap/tiles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Heatmap window: completed legs in the last 30 days. Long enough to look
// populated outside high season, short enough that closed-shop drivers don't
// pollute the signal.
const HEATMAP_WINDOW_DAYS = 30;

interface RouteContext {
  params: Promise<{ z: string; x: string; y: string }>;
}

interface DensityRow {
  bin_lng: number;
  bin_lat: number;
  drop_count: number;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const params = await context.params;

  let tile;
  try {
    tile = parseTileParams(params);
  } catch (err) {
    if (err instanceof TileValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const bbox = tileToBBox(tile);
  const sinceTs = new Date(Date.now() - HEATMAP_WINDOW_DAYS * 86_400_000).toISOString();
  const gridSize = suggestedBinSizeM(tile.z);

  const { data, error } = await supabase.rpc('heatmap_drop_density', {
    min_lng: bbox.minLng,
    min_lat: bbox.minLat,
    max_lng: bbox.maxLng,
    max_lat: bbox.maxLat,
    since_ts: sinceTs,
    grid_size_m: gridSize,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as DensityRow[];
  const features = rows.map((r) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [r.bin_lng, r.bin_lat] },
    properties: { count: r.drop_count },
  }));

  const response = NextResponse.json(
    { type: 'FeatureCollection', features },
    {
      headers: {
        // Cache hint for the browser — bins shift slowly enough that a few
        // minutes of staleness on the heatmap doesn't matter, and it keeps
        // the RPC cost per pan low. Vercel CDN respects s-maxage as long
        // as the response is private-able; we keep it private since this is
        // an authenticated endpoint.
        'cache-control': 'private, max-age=60',
      },
    },
  );
  return response;
}
