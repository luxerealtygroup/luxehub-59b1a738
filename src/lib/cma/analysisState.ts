// Shared rules for deciding whether a CMA analysis run is genuinely in flight
// or has died mid-run and should be treated as failed.

export const ANALYSIS_STALE_MS = 15 * 60 * 1000; // 15 minutes

export type AnalysisState = 'draft' | 'processing' | 'stale' | 'error' | 'completed';

export interface AnalysisStateInput {
  analysis_status?: string | null;
  analysis_started_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

/** Timestamp we believe the current run started at. */
export const analysisRunStartedAt = (r: AnalysisStateInput): Date | null => {
  const raw = r.analysis_started_at || r.updated_at || r.created_at;
  return raw ? new Date(raw) : null;
};

export const getAnalysisState = (r: AnalysisStateInput, now: number = Date.now()): AnalysisState => {
  const status = r.analysis_status || 'draft';
  if (status !== 'processing') {
    return status === 'completed' || status === 'error' || status === 'draft'
      ? (status as AnalysisState)
      : 'completed';
  }
  const started = analysisRunStartedAt(r);
  if (!started || Number.isNaN(started.getTime())) return 'stale';
  return now - started.getTime() > ANALYSIS_STALE_MS ? 'stale' : 'processing';
};

export const analysisStateLabel: Record<AnalysisState, string> = {
  draft: 'Draft',
  processing: 'Processing',
  stale: 'Failed',
  error: 'Failed',
  completed: 'Completed',
};
