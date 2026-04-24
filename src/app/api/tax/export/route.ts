// GET /api/tax/export?year=YYYY&quarter=1..4&format=csv|xml
//
// Downloads a quarterly Cyprus tax summary for the signed-in driver.
// Math is in src/lib/services/tax/compute.ts; serialisation in ./serialise.
// This route orchestrates: auth, fetch, compute, serialise, persist audit
// row, stream back as a file attachment.
//
// The audit trail (tax_exports) is INSERTed before we respond, which means
// every byte the driver received leaves a trace. Useful for regulatory
// pushback ("what were you given for Q1?") and for detecting reconciliation
// errors between exports.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase-server';
import { computeQuarterly, trailing12mRange, type TxRow, type QuarterKey } from '@/lib/services/tax/compute';
import { serialiseCsv, serialiseXml, type ExportMeta } from '@/lib/services/tax/serialise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const year = Number.parseInt(url.searchParams.get('year') ?? '', 10);
  const quarterRaw = Number.parseInt(url.searchParams.get('quarter') ?? '', 10);
  const format = (url.searchParams.get('format') ?? 'csv').toLowerCase();

  if (!Number.isInteger(year) || year < 2024 || year > 2100) {
    return NextResponse.json({ error: 'invalid_year' }, { status: 400 });
  }
  if (!Number.isInteger(quarterRaw) || quarterRaw < 1 || quarterRaw > 4) {
    return NextResponse.json({ error: 'invalid_quarter' }, { status: 400 });
  }
  if (format !== 'csv' && format !== 'xml') {
    return NextResponse.json({ error: 'invalid_format' }, { status: 400 });
  }
  const key: QuarterKey = { year, quarter: quarterRaw as 1 | 2 | 3 | 4 };

  // Fetch the trailing-12m window once; compute slices the quarter from it.
  const trailing = trailing12mRange(key);
  const { data: rows, error } = await supabase
    .from('transactions')
    .select('type, amount, created_at')
    .eq('user_id', user.id)
    .gte('created_at', trailing.fromIso)
    .lt('created_at', trailing.toIso);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tx: TxRow[] = (rows ?? []).map((r) => ({
    type: (r as Record<string, unknown>).type as TxRow['type'],
    amount: Number((r as Record<string, unknown>).amount),
    created_at: (r as Record<string, unknown>).created_at as string,
  }));

  const totals = computeQuarterly(tx, key);

  // Driver's display name + licence come from profiles / driver_verification.
  // Best-effort: missing values render as empty strings in the serialisers.
  const [{ data: profile }, { data: verification }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    supabase.from('driver_verification').select('licence_number').eq('user_id', user.id).maybeSingle(),
  ]);

  const meta: ExportMeta = {
    userId: user.id,
    driverName: ((profile ?? {}) as { full_name?: string }).full_name,
    licenceNumber: ((verification ?? {}) as { licence_number?: string }).licence_number,
    key,
    generatedAtIso: new Date().toISOString(),
  };

  const body = format === 'csv' ? serialiseCsv(totals, meta) : serialiseXml(totals, meta);
  const filename = `dromos-tax-${year}-q${quarterRaw}.${format}`;
  const contentType = format === 'csv' ? 'text/csv; charset=utf-8' : 'application/xml; charset=utf-8';

  // Audit row — best-effort; don't fail the download if the insert errors.
  void supabase.from('tax_exports').insert({
    user_id: user.id,
    year,
    quarter: quarterRaw,
    format,
    gross_eur: totals.grossEur,
    refunds_eur: totals.refundsEur,
    net_eur: totals.netEur,
    si_eur: totals.socialInsuranceEur,
    gesy_eur: totals.gesyEur,
    vat_due_eur: totals.vatDueEur,
    trailing_12m_turnover_eur: totals.trailing12mTurnoverEur,
    vat_registered: totals.vatRegistered,
    row_count: totals.rowCount,
  });

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
