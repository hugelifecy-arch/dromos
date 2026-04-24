-- ============================================
-- DROMOS - Tax / VAT export audit trail (Sprint 17)
-- ============================================
-- Records every quarterly tax export a driver generated. Not load-bearing
-- in the compute path — the export is a pure function of the driver's
-- transactions rows — but it's the evidence we need to prove, months
-- later, what numbers we handed the driver at what time.
--
-- Cyprus self-employed obligations the exporter covers (spec §2.2 gap 9):
--   * Social Insurance Fund (ΚΣ / KS)       16.6% of net earnings
--   * General Health Contribution (ΓεΣΥ)    4.0% of net earnings
--   * VAT (ΦΠΑ)                             19% on taxable turnover,
--                                           mandatory over €15,600/12mo
-- Rates + thresholds live in application code (src/lib/services/tax/
-- compute.ts) so a rate change is a one-file diff plus a re-export, not a
-- migration.
--
-- What we do NOT store here: the full CSV/XML body. That's regenerable
-- and storing it creates a GDPR retention surface we don't want.

create type tax_export_format as enum ('csv', 'xml');

create table public.tax_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  year integer not null check (year between 2024 and 2100),
  quarter smallint not null check (quarter between 1 and 4),
  format tax_export_format not null,

  -- Snapshot of the computed totals at export time. Decimals matched to
  -- how the tax forms are rounded in Cyprus (two decimals).
  gross_eur decimal(12,2) not null,
  refunds_eur decimal(12,2) not null default 0,
  net_eur decimal(12,2) not null,
  si_eur decimal(12,2) not null,
  gesy_eur decimal(12,2) not null,
  vat_due_eur decimal(12,2) not null default 0,

  -- Turnover over the trailing 12 months at export time. Used to decide
  -- whether VAT was owed for the exported quarter (threshold check is
  -- applied at compute time).
  trailing_12m_turnover_eur decimal(12,2) not null,
  vat_registered boolean not null,

  -- Number of transactions rows included in the totals. Sanity-check for
  -- any future reconciliation pass.
  row_count integer not null check (row_count >= 0),

  generated_at timestamptz not null default now()
);

comment on table public.tax_exports is
  'Audit trail of quarterly Cyprus tax exports. Stores computed totals, not the CSV/XML body.';

create index idx_tax_exports_user_quarter
  on public.tax_exports(user_id, year desc, quarter desc);

alter table public.tax_exports enable row level security;

-- A driver sees only their own exports. Writes go via the authed session
-- on /api/tax/export (which owns the insert).
create policy "Users view own tax exports" on public.tax_exports
  for select using (auth.uid() = user_id);

create policy "Users insert own tax exports" on public.tax_exports
  for insert with check (auth.uid() = user_id);
