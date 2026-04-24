'use client';

// Live empty-leg heatmap (spec §3.1, strategy doc §3.1).
//
// Drop-density across Cyprus, painted from /api/heatmap/[z]/[x]/[y]. Built on
// MapLibre + OpenStreetMap raster tiles (no paid Mapbox token; matches spec
// §7 "MapLibre + OpenStreetMap (cheaper at scale)" fallback). The tile route
// already does k-anonymity (suppresses bins with <3 drops) so the map can
// faithfully render whatever it gets.
//
// Why a raster basemap with a vector heatmap on top: vector tiles need a
// style server we don't run, and Cyprus is small enough that OSM raster tiles
// are fast. We can swap in a vector style later without touching the data
// layer.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const CYPRUS_CENTRE: [number, number] = [33.4, 35.0];
const INITIAL_ZOOM = 9;

type FeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: { count: number };
  }>;
};

export default function HeatmapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [error, setError] = useState('');
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return; // strict-mode guard

    // Inline style: OSM raster only. Keeps us off any paid tile service and
    // doesn't need a style.json endpoint.
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: CYPRUS_CENTRE,
      zoom: INITIAL_ZOOM,
      minZoom: 6,
      maxZoom: 14,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource('drops', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'drops-heat',
        type: 'heatmap',
        source: 'drops',
        maxzoom: 14,
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'count'], 0, 0, 50, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 6, 1, 14, 3],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(33,102,172,0)',
            0.2, 'rgba(103,169,207,0.6)',
            0.4, 'rgb(209,229,240)',
            0.6, 'rgb(253,219,199)',
            0.8, 'rgb(239,138,98)',
            1, 'rgb(178,24,43)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 6, 8, 14, 30],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.85, 14, 0.6],
        },
      });

      // At very close zooms drop a faint dot per bin so high-density bins are
      // still legible after the heatmap blur fades out.
      map.addLayer({
        id: 'drops-points',
        type: 'circle',
        source: 'drops',
        minzoom: 11,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 3, 2, 100, 8],
          'circle-color': 'rgb(178,24,43)',
          'circle-opacity': 0.7,
          'circle-stroke-color': 'white',
          'circle-stroke-width': 0.5,
        },
      });

      void refreshTiles();
    });

    map.on('moveend', () => { void refreshTiles(); });

    async function refreshTiles() {
      const m = mapRef.current;
      if (!m) return;
      const z = Math.round(m.getZoom());
      const bounds = m.getBounds();

      // Slippy-map tile coords for the corners of the viewport.
      const lngToX = (lng: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
      const latToY = (lat: number) => {
        const rad = (lat * Math.PI) / 180;
        return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
      };
      const xMin = Math.max(0, lngToX(bounds.getWest()));
      const xMax = Math.min(2 ** z - 1, lngToX(bounds.getEast()));
      const yMin = Math.max(0, latToY(bounds.getNorth()));
      const yMax = Math.min(2 ** z - 1, latToY(bounds.getSouth()));

      // Cap the number of tile fetches so a wild pan can't fan out 100s of
      // requests. Hard ceiling 16 tiles per refresh; if the viewport spans
      // more, the user is too zoomed out for useful detail anyway.
      const tilesNeeded: Array<[number, number]> = [];
      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          tilesNeeded.push([x, y]);
          if (tilesNeeded.length >= 16) break;
        }
        if (tilesNeeded.length >= 16) break;
      }

      try {
        const responses = await Promise.all(
          tilesNeeded.map(([x, y]) =>
            fetch(`/api/heatmap/${z}/${x}/${y}`).then(async (r) => {
              if (r.status === 401) throw new Error('auth');
              if (!r.ok) return { features: [] } as { features: FeatureCollection['features'] };
              return r.json() as Promise<FeatureCollection>;
            }),
          ),
        );
        const merged: FeatureCollection = {
          type: 'FeatureCollection',
          features: responses.flatMap((r) => r.features ?? []),
        };
        const src = m.getSource('drops') as maplibregl.GeoJSONSource | undefined;
        src?.setData(merged);
        setEmpty(merged.features.length === 0);
        setError('');
      } catch (e) {
        if (e instanceof Error && e.message === 'auth') {
          setError('Sign in to view the heatmap.');
        } else {
          setError('Could not load drop density.');
        }
      }
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="max-w-lg mx-auto h-screen flex flex-col">
      <header className="bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 flex items-center gap-3 z-40">
        <Link href="/app" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <MapPin className="w-5 h-5 text-brand-400" />
        <h1 className="text-xl font-bold text-white flex-1">Drop heatmap</h1>
      </header>

      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {error && (
          <div className="absolute top-3 left-3 right-3 text-sm text-red-300 bg-red-900/80 backdrop-blur rounded-xl px-3 py-2 z-10">
            {error}
          </div>
        )}
        {empty && !error && (
          <div className="absolute top-3 left-3 right-3 text-sm text-surface-300 bg-surface-900/80 backdrop-blur rounded-xl px-3 py-2 z-10">
            No drop activity in this area in the last 30 days.
          </div>
        )}
      </div>
    </div>
  );
}
