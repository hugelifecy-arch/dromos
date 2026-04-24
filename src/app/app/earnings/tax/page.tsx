'use client';

// Quarterly tax export page for drivers.
//
// Route: /app/earnings/tax
//
// Shows a year/quarter picker, a preview of the computed totals, and two
// download buttons (CSV / XML). The preview uses the same code path as the
// download — we call the export API once as CSV and parse the totals out
// of the first 15 rows. Crude but avoids a separate "totals" endpoint for
// v1.
//
// The totals banner intentionally labels this as a "reference summary" so
// no driver mistakes it for an automatic TAXISnet filing; the real filing
// is a manual transcription (or, later, a TAXISnet integration).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, FileText } from 'lucide-react';

interface Totals {
  grossEur: number;
  refundsEur: number;
  netEur: number;
  socialInsuranceEur: number;
  gesyEur: number;
  vatDueEur: number;
  trailing12mTurnoverEur: number;
  vatRegistered: boolean;
  rowCount: number;
}

const CURRENT_YEAR = new Date().getUTCFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
const QUARTERS: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];

export default function TaxExportPage() {
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(1);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadPreview(year, quarter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, quarter]);

  async function loadPreview(y: number, q: 1 | 2 | 3 | 4) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/tax/export?year=${y}&quarter=${q}&format=csv`);
      if (res.status === 401) throw new Error('Sign in required.');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const csv = await res.text();
      setTotals(parseCsvTotals(csv));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setTotals(null);
    }
    setLoading(false);
  }

  function download(format: 'csv' | 'xml') {
    const url = `/api/tax/export?year=${year}&quarter=${quarter}&format=${format}`;
    window.location.href = url;
  }

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href="/app/earnings" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <FileText className="w-5 h-5 text-brand-400" />
        <h1 className="text-xl font-bold text-white flex-1">Tax / VAT export</h1>
      </header>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-surface-400">Year</span>
            <select
              value={year}
              onChange={(e) => setYear(Number.parseInt(e.target.value, 10))}
              className="mt-1 w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-white"
            >
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-surface-400">Quarter</span>
            <select
              value={quarter}
              onChange={(e) => setQuarter(Number.parseInt(e.target.value, 10) as 1 | 2 | 3 | 4)}
              className="mt-1 w-full bg-surface-900 border border-surface-800 rounded-xl px-3 py-2.5 text-white"
            >
              {QUARTERS.map((q) => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </label>
        </div>

        {error && (
          <div className="text-sm text-red-300 bg-red-400/10 rounded-xl px-3 py-2">{error}</div>
        )}

        {loading && !totals && (
          <div className="text-sm text-surface-400">Computing…</div>
        )}

        {totals && (
          <div className="rounded-xl border border-surface-800 bg-surface-900 p-5 space-y-3">
            <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              Reference summary only. File your return via TAXISnet or through your accountant.
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Stat label="Gross" value={`€${totals.grossEur.toFixed(2)}`} />
              <Stat label="Refunds" value={`€${totals.refundsEur.toFixed(2)}`} />
              <Stat label="Net" value={`€${totals.netEur.toFixed(2)}`} emphasised />
              <Stat label="Rows" value={String(totals.rowCount)} />
              <Stat label="SI 16.6%" value={`€${totals.socialInsuranceEur.toFixed(2)}`} />
              <Stat label="GESY 4%" value={`€${totals.gesyEur.toFixed(2)}`} />
            </div>
            <div className="border-t border-surface-800 pt-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-surface-400">VAT registered</span>
                <span className={totals.vatRegistered ? 'text-brand-300' : 'text-surface-500'}>
                  {totals.vatRegistered ? 'yes' : 'no'}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-surface-400">Trailing 12m turnover</span>
                <span className="text-white">€{totals.trailing12mTurnoverEur.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-surface-400">VAT due (19%)</span>
                <span className={totals.vatDueEur > 0 ? 'text-brand-300 font-semibold' : 'text-surface-500'}>
                  €{totals.vatDueEur.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => download('csv')}
            className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={() => download('xml')}
            className="flex items-center justify-center gap-2 bg-surface-800 hover:bg-surface-700 text-surface-200 font-medium py-3 rounded-xl"
          >
            <Download className="w-4 h-4" /> XML
          </button>
        </div>

        <p className="text-xs text-surface-500">
          Social Insurance 16.6% and GESY 4% are the standard self-employed rates.
          VAT (19%) applies once your rolling-12-month taxi turnover crosses
          €15,600. Rates may change; verify with the Ministry before filing.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, emphasised }: { label: string; value: string; emphasised?: boolean }) {
  return (
    <div className={emphasised ? 'col-span-2 bg-surface-800 rounded-lg p-3' : ''}>
      <div className="text-xs uppercase text-surface-400">{label}</div>
      <div className={`font-semibold ${emphasised ? 'text-2xl text-brand-200' : 'text-white'}`}>{value}</div>
    </div>
  );
}

/**
 * Parse the CSV the export route returns. It's a stable two-column
 * summary; we lift the values back out by field label.
 */
function parseCsvTotals(csv: string): Totals {
  const map = new Map<string, string>();
  for (const line of csv.split('\r\n')) {
    if (!line) continue;
    const m = line.match(/^"([^"]*)","((?:[^"]|"")*)"$/);
    if (!m) continue;
    map.set(m[1], m[2].replace(/""/g, '"'));
  }
  const num = (k: string) => Number.parseFloat(map.get(k) ?? '0') || 0;
  return {
    grossEur: num('Gross EUR'),
    refundsEur: num('Refunds EUR'),
    netEur: num('Net EUR'),
    socialInsuranceEur: num('Social Insurance (16.6%) EUR'),
    gesyEur: num('GESY (4.0%) EUR'),
    vatDueEur: num('VAT due (19%) EUR'),
    trailing12mTurnoverEur: num('Trailing 12m turnover EUR'),
    vatRegistered: map.get('VAT registered') === 'yes',
    rowCount: Number.parseInt(map.get('Row count') ?? '0', 10) || 0,
  };
}
