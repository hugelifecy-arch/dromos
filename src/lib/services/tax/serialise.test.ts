// Self-checking tests for CSV + XML serialisers.
// Run with `npx tsx`.

import assert from 'node:assert/strict';

import type { QuarterlyTotals } from './compute';
import { serialiseCsv, serialiseXml, type ExportMeta } from './serialise';

interface TestResult { name: string; passed: boolean; error?: string }

function runCase(name: string, fn: () => void, results: TestResult[]): void {
  try { fn(); results.push({ name, passed: true }); }
  catch (err) { results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) }); }
}

const sampleTotals: QuarterlyTotals = {
  grossEur: 4200,
  refundsEur: 120,
  netEur: 4080,
  socialInsuranceEur: 677.28,
  gesyEur: 163.2,
  vatDueEur: 775.2,
  trailing12mTurnoverEur: 16800,
  vatRegistered: true,
  rowCount: 42,
};

const sampleMeta: ExportMeta = {
  userId: 'u-1',
  driverName: 'Γιώργος "Geo" Papadopoulos',
  licenceNumber: 'TN-123',
  key: { year: 2026, quarter: 1 },
  generatedAtIso: '2026-04-24T10:00:00.000Z',
};

export function runTaxSerialiseTests(): { passed: number; failed: number; results: TestResult[] } {
  const results: TestResult[] = [];

  runCase('csv has a header row + all totals', () => {
    const csv = serialiseCsv(sampleTotals, sampleMeta);
    const lines = csv.split('\r\n').filter(Boolean);
    assert.equal(lines[0], '"Field","Value"');
    assert.ok(lines.some((l) => l.startsWith('"Gross EUR","4200.00"')));
    assert.ok(lines.some((l) => l.includes('"Social Insurance (16.6%) EUR","677.28"')));
    assert.ok(lines.some((l) => l.includes('"VAT due (19%) EUR","775.20"')));
    assert.ok(lines.some((l) => l.includes('"Row count","42"')));
  }, results);

  runCase('csv quotes internal double-quotes by doubling', () => {
    const csv = serialiseCsv(sampleTotals, sampleMeta);
    // sample driver name contains "Geo" which must serialise as ""Geo"".
    assert.match(csv, /"Γιώργος ""Geo"" Papadopoulos"/);
  }, results);

  runCase('csv line endings are CRLF', () => {
    const csv = serialiseCsv(sampleTotals, sampleMeta);
    assert.ok(csv.includes('\r\n'));
    // No bare \n should appear outside of CRLF sequences.
    assert.equal(csv.match(/[^\r]\n/), null);
  }, results);

  runCase('xml contains all totals as elements and escapes hostile input', () => {
    const hostileMeta: ExportMeta = {
      ...sampleMeta,
      driverName: 'A & <B> "C" \'D\'',
    };
    const xml = serialiseXml(sampleTotals, hostileMeta);
    // Escape: & -> &amp;, < -> &lt;, " -> &quot; etc.
    assert.match(xml, /<DriverName>A &amp; &lt;B&gt; &quot;C&quot; &apos;D&apos;<\/DriverName>/);
    assert.match(xml, /<Gross>4200\.00<\/Gross>/);
    assert.match(xml, /<Due rate="0\.19">775\.20<\/Due>/);
    assert.match(xml, /<Registered>true<\/Registered>/);
    // Root element declares placeholder schema.
    assert.match(xml, /<DromosTaxExport schema="placeholder-v1">/);
    // Placeholder comment is present so no downstream mistakes production
    // for a final schema.
    assert.match(xml, /<!-- Dromos tax export\. Placeholder schema/);
  }, results);

  runCase('xml has the XML declaration', () => {
    const xml = serialiseXml(sampleTotals, sampleMeta);
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  }, results);

  runCase('xml VAT block reflects vatRegistered=false cleanly', () => {
    const noVat: QuarterlyTotals = { ...sampleTotals, vatRegistered: false, vatDueEur: 0 };
    const xml = serialiseXml(noVat, sampleMeta);
    assert.match(xml, /<Registered>false<\/Registered>/);
    assert.match(xml, /<Due rate="0\.19">0\.00<\/Due>/);
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
  const { passed, failed, results } = runTaxSerialiseTests();
  for (const r of results) {
    const mark = r.passed ? 'OK  ' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`${mark}  ${r.name}${r.error ? ` - ${r.error}` : ''}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
