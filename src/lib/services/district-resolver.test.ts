import assert from 'node:assert/strict';
import { resolveDistrictFromText } from './district-resolver';

interface TestResult { name: string; passed: boolean; error?: string }

function runCase(name: string, fn: () => void, results: TestResult[]): void {
  try { fn(); results.push({ name, passed: true }); }
  catch (err) { results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) }); }
}

export function runDistrictResolverTests(): { passed: number; failed: number; results: TestResult[] } {
  const results: TestResult[] = [];

  runCase('canonical CYPRUS_KEY_LOCATIONS strings', () => {
    assert.equal(resolveDistrictFromText('Larnaca Airport (LCA)'), 'larnaca');
    assert.equal(resolveDistrictFromText('Paphos Harbour'), 'paphos');
    assert.equal(resolveDistrictFromText('Limassol Old Port'), 'limassol');
    assert.equal(resolveDistrictFromText('Nicosia, Eleftheria Square'), 'nicosia');
  }, results);

  runCase('district aliases resolve', () => {
    assert.equal(resolveDistrictFromText('Ayia Napa beach'), 'famagusta');
    assert.equal(resolveDistrictFromText('Protaras hotel'), 'famagusta');
    assert.equal(resolveDistrictFromText('Lemesos port'), 'limassol');
    assert.equal(resolveDistrictFromText('Lefkosia centre'), 'nicosia');
  }, results);

  runCase('longer keyword wins over shorter prefix', () => {
    // "ayia napa" should map to famagusta, not e.g. "napa" inside something
    assert.equal(resolveDistrictFromText('Ayia Napa strip'), 'famagusta');
  }, results);

  runCase('unrecognised locality returns null', () => {
    assert.equal(resolveDistrictFromText('Platres mountain village'), null);
    assert.equal(resolveDistrictFromText(''), null);
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
  const { passed, failed, results } = runDistrictResolverTests();
  for (const r of results) {
    const mark = r.passed ? 'OK  ' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`${mark}  ${r.name}${r.error ? ` - ${r.error}` : ''}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
