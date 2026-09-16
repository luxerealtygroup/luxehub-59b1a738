alter table public.cma_reports
  add column if not exists analysis_started_at timestamptz,
  add column if not exists analysis_error text;

-- Backfill a start time for rows already sitting in processing so the
-- staleness rule has something concrete to measure against.
update public.cma_reports
set analysis_started_at = coalesce(analysis_started_at, updated_at, created_at)
where analysis_status = 'processing' and analysis_started_at is null;