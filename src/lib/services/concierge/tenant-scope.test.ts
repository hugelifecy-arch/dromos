// Self-checking tests for the tenant-scope resolver.
// Run with `npx tsx`.

import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  isMemberOf,
  resolveTenantBySlug,
  resolveTenantScope,
  type TenantScope,
} from './tenant-scope';

interface TestResult { name: string; passed: boolean; error?: string }

function runCase(name: string, fn: () => Promise<void>, results: TestResult[]): Promise<void> {
  return fn()
    .then(() => { results.push({ name, passed: true }); })
    .catch((err) => { results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) }); });
}

// --------------------------------------------------------------------------
// Fake Supabase — only the query shapes the resolver uses.
// --------------------------------------------------------------------------

function fakeAuthedSupabase(opts: {
  user: { id: string } | null;
  memberships?: Array<{
    role: 'owner' | 'staff';
    created_at: string;
    tenants: { id: string; slug: string; name: string; type: 'hotel' | 'agency'; district: string };
  }>;
  tenantBySlug?: Record<string, { id: string; slug: string; name: string; district: string }>;
}): SupabaseClient {
  const auth = {
    getUser: async () => ({ data: { user: opts.user }, error: null }),
  };

  const from = (table: string) => {
    if (table === 'tenant_members') {
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: opts.memberships ?? [], error: null }),
          }),
        }),
      };
    }
    if (table === 'tenants') {
      return {
        select: () => ({
          eq: (_col: string, slug: string) => ({
            maybeSingle: async () => ({
              data: opts.tenantBySlug?.[slug] ?? null,
              error: null,
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  };

  return { auth, from } as unknown as SupabaseClient;
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

export async function runTenantScopeTests(): Promise<{ passed: number; failed: number; results: TestResult[] }> {
  const results: TestResult[] = [];

  await runCase('no auth -> null scope', async () => {
    const sb = fakeAuthedSupabase({ user: null });
    const scope = await resolveTenantScope(sb);
    assert.equal(scope, null);
  }, results);

  await runCase('auth but no memberships -> null scope', async () => {
    const sb = fakeAuthedSupabase({ user: { id: 'u1' }, memberships: [] });
    const scope = await resolveTenantScope(sb);
    assert.equal(scope, null);
  }, results);

  await runCase('single membership -> scope with one tenant', async () => {
    const sb = fakeAuthedSupabase({
      user: { id: 'u1' },
      memberships: [{
        role: 'owner',
        created_at: '2026-04-01T00:00:00Z',
        tenants: { id: 't1', slug: 'hotel-aphrodite', name: 'Aphrodite', type: 'hotel', district: 'limassol' },
      }],
    });
    const scope = await resolveTenantScope(sb);
    assert.ok(scope);
    assert.equal(scope!.tenants.length, 1);
    assert.equal(scope!.tenants[0].slug, 'hotel-aphrodite');
    assert.equal(scope!.tenants[0].role, 'owner');
    assert.equal(scope!.defaultTenantId, 't1');
  }, results);

  await runCase('multiple memberships -> most recent first, default = most recent', async () => {
    // The fake's .order() returns rows in the order given; mimic DB
    // "ascending: false" by pre-sorting here.
    const sb = fakeAuthedSupabase({
      user: { id: 'u1' },
      memberships: [
        { role: 'staff', created_at: '2026-03-01T00:00:00Z', tenants: { id: 't-newer', slug: 'b', name: 'B', type: 'hotel', district: 'larnaca' } },
        { role: 'owner', created_at: '2025-10-01T00:00:00Z', tenants: { id: 't-older', slug: 'a', name: 'A', type: 'hotel', district: 'paphos' } },
      ],
    });
    const scope = await resolveTenantScope(sb);
    assert.ok(scope);
    assert.equal(scope!.tenants.length, 2);
    assert.equal(scope!.defaultTenantId, 't-newer');
  }, results);

  await runCase('isMemberOf gate', async () => {
    const scope: TenantScope = {
      userId: 'u1',
      defaultTenantId: 't1',
      tenants: [
        { id: 't1', slug: 's1', name: 'S1', type: 'hotel', district: 'limassol', role: 'staff' },
      ],
    };
    assert.equal(isMemberOf(scope, 't1'), true);
    assert.equal(isMemberOf(scope, 't2'), false);
  }, results);

  await runCase('resolveTenantBySlug returns only public fields', async () => {
    const sb = fakeAuthedSupabase({
      user: null,
      tenantBySlug: {
        'hotel-aphrodite': { id: 't1', slug: 'hotel-aphrodite', name: 'Aphrodite', district: 'limassol' },
      },
    });
    const t = await resolveTenantBySlug(sb, 'hotel-aphrodite');
    assert.ok(t);
    assert.equal(t!.slug, 'hotel-aphrodite');
    assert.equal(t!.district, 'limassol');
    // Fake only has public fields; this just codifies the shape.
    assert.equal((t as unknown as Record<string, unknown>).contact_email, undefined);
  }, results);

  await runCase('resolveTenantBySlug returns null for unknown slug', async () => {
    const sb = fakeAuthedSupabase({ user: null, tenantBySlug: {} });
    const t = await resolveTenantBySlug(sb, 'nope');
    assert.equal(t, null);
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
  runTenantScopeTests().then(({ passed, failed, results }) => {
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
