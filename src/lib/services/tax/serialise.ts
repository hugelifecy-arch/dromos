// Tax export serialisers.
//
// Two shapes:
//   * CSV — single-row summary. Headers match the labels on the Cyprus
//           Social Insurance and VAT forms so a driver (or their
//           accountant) can paste the values across by eye.
//   * XML — placeholder shape for TAXISnet ingestion. The real TAXISnet
//           EDI schema is proprietary + per-return-type; we ship a
//           structurally-correct but labelled-placeholder XML so ops can
//           reconcile the final field mapping once a driver completes a
//           real filing. Clearly labelled in the root element + comment.
//
// Both serialisers are pure functions. No DB, no I/O.

import type { QuarterKey, QuarterlyTotals } from './compute';

export interface ExportMeta {
  userId: string;
  driverName?: string;
  licenceNumber?: string;
  key: QuarterKey;
  generatedAtIso: string;
}

// --------------------------------------------------------------------------
// CSV
// --------------------------------------------------------------------------

export function serialiseCsv(totals: QuarterlyTotals, meta: ExportMeta): string {
  // Standard RFC 4180 quoting: wrap every field in quotes, escape internal
  // quotes by doubling. This is cheaper than detecting when quoting is
  // needed and safer for accountants who'll paste into Excel.
  const rows: Array<Array<string | number>> = [
    ['Field', 'Value'],
    ['User ID', meta.userId],
    ['Driver name', meta.driverName ?? ''],
    ['Licence number', meta.licenceNumber ?? ''],
    ['Year', meta.key.year],
    ['Quarter', `Q${meta.key.quarter}`],
    ['Generated at', meta.generatedAtIso],
    ['Gross EUR', totals.grossEur.toFixed(2)],
    ['Refunds EUR', totals.refundsEur.toFixed(2)],
    ['Net EUR', totals.netEur.toFixed(2)],
    ['Social Insurance (16.6%) EUR', totals.socialInsuranceEur.toFixed(2)],
    ['GESY (4.0%) EUR', totals.gesyEur.toFixed(2)],
    ['VAT registered', totals.vatRegistered ? 'yes' : 'no'],
    ['Trailing 12m turnover EUR', totals.trailing12mTurnoverEur.toFixed(2)],
    ['VAT due (19%) EUR', totals.vatDueEur.toFixed(2)],
    ['Row count', totals.rowCount],
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function csvCell(v: string | number): string {
  const s = String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

// --------------------------------------------------------------------------
// XML
// --------------------------------------------------------------------------

export function serialiseXml(totals: QuarterlyTotals, meta: ExportMeta): string {
  // Manual string building; the payload is small + stable, and an XML
  // library buys us nothing here. Every field is `xmlEscape`d so a hostile
  // driverName or licenceNumber can't smuggle in markup.
  const e = xmlEscape;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Dromos tax export. Placeholder schema — reconcile with the final',
    '     TAXISnet EDI field map before first production filing. -->',
    `<DromosTaxExport schema="placeholder-v1">`,
    '  <Meta>',
    `    <UserID>${e(meta.userId)}</UserID>`,
    `    <DriverName>${e(meta.driverName ?? '')}</DriverName>`,
    `    <LicenceNumber>${e(meta.licenceNumber ?? '')}</LicenceNumber>`,
    `    <Year>${meta.key.year}</Year>`,
    `    <Quarter>Q${meta.key.quarter}</Quarter>`,
    `    <GeneratedAt>${e(meta.generatedAtIso)}</GeneratedAt>`,
    '  </Meta>',
    '  <Income currency="EUR">',
    `    <Gross>${totals.grossEur.toFixed(2)}</Gross>`,
    `    <Refunds>${totals.refundsEur.toFixed(2)}</Refunds>`,
    `    <Net>${totals.netEur.toFixed(2)}</Net>`,
    `    <Trailing12mTurnover>${totals.trailing12mTurnoverEur.toFixed(2)}</Trailing12mTurnover>`,
    '  </Income>',
    '  <Contributions currency="EUR">',
    `    <SocialInsurance rate="0.166">${totals.socialInsuranceEur.toFixed(2)}</SocialInsurance>`,
    `    <Gesy rate="0.04">${totals.gesyEur.toFixed(2)}</Gesy>`,
    '  </Contributions>',
    '  <Vat currency="EUR">',
    `    <Registered>${totals.vatRegistered ? 'true' : 'false'}</Registered>`,
    `    <Due rate="0.19">${totals.vatDueEur.toFixed(2)}</Due>`,
    '  </Vat>',
    `  <RowCount>${totals.rowCount}</RowCount>`,
    '</DromosTaxExport>',
    '',
  ].join('\n');
}

function xmlEscape(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
