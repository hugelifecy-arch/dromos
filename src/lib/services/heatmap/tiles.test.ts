// Self-checking tests for tile-coordinate math + validation.
// Run with `npx tsx`.

import assert from 'node:assert/strict';

import {
  TileValidationError,
  parseTileParams,
  suggestedBinSizeM,
  tileToBBox,
} from './tiles';

interface TestResult { name: string; passed: boolean; error?: string }

function runCase(name: string, fn: () => void, results: TestResult[]): void {
  try { fn(); results.push({ name, passed: true }); }
  catch (err) { results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) }); }
}

function approx(a: number, b: number, eps = 1e-6): void {
  if (Math.abs(a - b) > eps) {
    throw new Error(`expected ${b} ± ${eps}, got ${a}`);
  }
}

export function runTileTests(): { passed: number; failed: number; results: TestResult[] } {
  const results: TestResult[] = [];

  runCase('z=0 returns the whole world', () => {
    const b = tileToBBox({ z: 0, x: 0, y: 0 });
    approx(b.minLng, -180);
    approx(b.maxLng, 180);
    approx(b.maxLat, 85.0511287798066, 1e-6);
    approx(b.minLat, -85.0511287798066, 1e-6);
  }, results);

  runCase('Cyprus tile at z=8 covers Larnaca', () => {
    // Larnaca ≈ 33.6E, 34.92N. At z=8 the OSM slippy-map tile is x=151, y=101.
    const b = tileToBBox({ z: 8, x: 151, y: 101 });
    const lng = 33.6, lat = 34.92;
    if (lng < b.minLng || lng > b.maxLng) throw new Error(`lng ${lng} outside bbox [${b.minLng}, ${b.maxLng}]`);
    if (lat < b.minLat || lat > b.maxLat) throw new Error(`lat ${lat} outside bbox [${b.minLat}, ${b.maxLat}]`);
  }, results);

  runCase('parseTileParams rejects non-integer input', () => {
    assert.throws(() => parseTileParams({ z: '8.5', x: '147', y: '104' }), TileValidationError);
  }, results);

  runCase('parseTileParams rejects out-of-range z', () => {
    assert.throws(() => parseTileParams({ z: '3', x: '0', y: '0' }), TileValidationError);
    assert.throws(() => parseTileParams({ z: '20', x: '0', y: '0' }), TileValidationError);
  }, results);

  runCase('parseTileParams rejects out-of-range x/y', () => {
    // z=8 -> max index 255
    assert.throws(() => parseTileParams({ z: '8', x: '256', y: '0' }), TileValidationError);
    assert.throws(() => parseTileParams({ z: '8', x: '0', y: '-1' }), TileValidationError);
  }, results);

  runCase('parseTileParams accepts valid coords', () => {
    const t = parseTileParams({ z: '8', x: '147', y: '104' });
    assert.deepEqual(t, { z: 8, x: 147, y: 104 });
  }, results);

  runCase('suggestedBinSizeM is clamped and quantised', () => {
    // High zoom -> small bins, but never below the 100m floor.
    const small = suggestedBinSizeM(14);
    if (small < 100 || small > 1000) throw new Error(`unexpected bin at z=14: ${small}`);
    if (small % 100 !== 0) throw new Error(`bin not quantised: ${small}`);

    // Low zoom -> large bins, capped at 10000.
    const big = suggestedBinSizeM(6);
    if (big > 10_000) throw new Error(`bin exceeded cap at z=6: ${big}`);
  }, results);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  return { passed, failed, results };
}

const isDirectRun =
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  // @ts-ignore
  require.main === module;

if (isDirectRun) {
  const { passed, failed, results } = runTileTests();
  for (const r of results) {
    const mark = r.passed ? 'OK  ' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`${mark}  ${r.name}${r.error ? ` - ${r.error}` : ''}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
