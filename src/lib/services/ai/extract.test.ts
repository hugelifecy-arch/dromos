// Self-checking tests for the Claude extraction wrapper.
//
// No test framework, run with `npx tsx`. We inject a fake fetch so the test
// exercises the request shape and response parsing without touching the
// Anthropic API.

import assert from 'node:assert/strict';

import {
  ANTHROPIC_VERSION,
  CLAUDE_MODEL,
  extractLegFromTranscript,
} from './extract';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function runCase(name: string, fn: () => Promise<void> | void, results: TestResult[]): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { results.push({ name, passed: true }); })
    .catch((err) => {
      results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) });
    });
}

function fakeFetch(body: unknown, status = 200, onCall?: (url: string, init: RequestInit) => void): typeof fetch {
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    onCall?.(String(input), init ?? {});
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return impl as unknown as typeof fetch;
}

function claudeTextResponse(text: string) {
  return { content: [{ type: 'text', text }] };
}

export async function runExtractTests(): Promise<{ passed: number; failed: number; results: TestResult[] }> {
  const results: TestResult[] = [];

  await runCase('canonical extraction from plain JSON', async () => {
    const json = JSON.stringify({
      originRaw: 'Λάρνακα',
      destinationRaw: 'Λεμεσός',
      originDistrict: 'larnaca',
      destinationDistrict: 'limassol',
      departureLocal: { hour: 18, minute: 30, dayOffset: 0, hadExplicitDate: true },
      askingPriceEur: 25,
      confidence: 0.92,
    });
    const result = await extractLegFromTranscript({
      apiKey: 'sk-test',
      transcript: 'Λάρνακα Λεμεσό στις έξι και μισή το απόγευμα, είκοσι πέντε',
      nowIso: '2026-04-24T10:00:00+03:00',
      fetchImpl: fakeFetch(claudeTextResponse(json)),
    });
    assert.ok(result);
    if (!result) return;
    assert.equal(result.originDistrict, 'larnaca');
    assert.equal(result.destinationDistrict, 'limassol');
    assert.equal(result.departureLocal.hour, 18);
    assert.equal(result.departureLocal.minute, 30);
    assert.equal(result.askingPriceEur, 25);
    assert.ok(result.confidence > 0.9);
  }, results);

  await runCase('extraction tolerates ```json code fences', async () => {
    const fenced = '```json\n' + JSON.stringify({
      originRaw: 'Πάφος',
      destinationRaw: 'Λεμεσός',
      originDistrict: 'paphos',
      destinationDistrict: 'limassol',
      departureLocal: { hour: 7, minute: 0, dayOffset: 1, hadExplicitDate: true },
      confidence: 0.8,
    }) + '\n```';
    const result = await extractLegFromTranscript({
      apiKey: 'sk-test',
      transcript: 'Paphos Limassol tomorrow at 7',
      nowIso: '2026-04-24T10:00:00+03:00',
      fetchImpl: fakeFetch(claudeTextResponse(fenced)),
    });
    assert.ok(result);
    if (!result) return;
    assert.equal(result.departureLocal.dayOffset, 1);
    assert.equal(result.askingPriceEur, undefined);
  }, results);

  await runCase('no_leg returns null', async () => {
    const result = await extractLegFromTranscript({
      apiKey: 'sk-test',
      transcript: 'Γεια σας, καλημέρα',
      nowIso: '2026-04-24T10:00:00+03:00',
      fetchImpl: fakeFetch(claudeTextResponse(JSON.stringify({ no_leg: true, reason: 'greeting' }))),
    });
    assert.equal(result, null);
  }, results);

  await runCase('rejects unknown district values', async () => {
    const json = JSON.stringify({
      originRaw: 'Σόφια',
      destinationRaw: 'Λεμεσός',
      originDistrict: 'sofia',  // not a Cyprus district
      destinationDistrict: 'limassol',
      departureLocal: { hour: 12, minute: 0, dayOffset: 0, hadExplicitDate: false },
    });
    await assert.rejects(
      () => extractLegFromTranscript({
        apiKey: 'sk-test',
        transcript: 'bad',
        nowIso: '2026-04-24T10:00:00+03:00',
        fetchImpl: fakeFetch(claudeTextResponse(json)),
      }),
      /claude_bad_districts/,
    );
  }, results);

  await runCase('rejects out-of-range hour/minute', async () => {
    const json = JSON.stringify({
      originDistrict: 'larnaca',
      destinationDistrict: 'limassol',
      departureLocal: { hour: 28, minute: 0, dayOffset: 0, hadExplicitDate: true },
    });
    await assert.rejects(
      () => extractLegFromTranscript({
        apiKey: 'sk-test',
        transcript: 'bad hour',
        nowIso: '2026-04-24T10:00:00+03:00',
        fetchImpl: fakeFetch(claudeTextResponse(json)),
      }),
      /claude_bad_departure_range/,
    );
  }, results);

  await runCase('bubbles up API errors with status', async () => {
    await assert.rejects(
      () => extractLegFromTranscript({
        apiKey: 'sk-test',
        transcript: 'whatever',
        nowIso: '2026-04-24T10:00:00+03:00',
        fetchImpl: fakeFetch({ error: 'rate limited' }, 429),
      }),
      /claude_failed: 429/,
    );
  }, results);

  await runCase('request uses expected model + headers', async () => {
    let sawUrl = '';
    let sawHeaders: Record<string, string> = {};
    let sawBody = '';
    const fetchImpl = fakeFetch(
      claudeTextResponse(JSON.stringify({
        originDistrict: 'larnaca',
        destinationDistrict: 'limassol',
        departureLocal: { hour: 9, minute: 0, dayOffset: 0, hadExplicitDate: false },
      })),
      200,
      (url, init) => {
        sawUrl = url;
        sawHeaders = Object.fromEntries(
          Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]),
        );
        sawBody = typeof init.body === 'string' ? init.body : '';
      },
    );
    await extractLegFromTranscript({
      apiKey: 'sk-abc',
      transcript: 'Larnaca Limassol',
      nowIso: '2026-04-24T10:00:00+03:00',
      fetchImpl,
    });
    assert.equal(sawUrl, 'https://api.anthropic.com/v1/messages');
    assert.equal(sawHeaders['x-api-key'], 'sk-abc');
    assert.equal(sawHeaders['anthropic-version'], ANTHROPIC_VERSION);
    const parsed = JSON.parse(sawBody);
    assert.equal(parsed.model, CLAUDE_MODEL);
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
  runExtractTests().then(({ passed, failed, results }) => {
    for (const r of results) {
      const mark = r.passed ? 'OK  ' : 'FAIL';
      // eslint-disable-next-line no-console
      console.log(`${mark}  ${r.name}${r.error ? ` - ${r.error}` : ''}`);
    }
    // eslint-disable-next-line no-console
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  });
}
