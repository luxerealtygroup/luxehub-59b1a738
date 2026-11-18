export const SLACK_TRACKING_START = '2026-11-18T19:30:00Z';
export function needsSlackRetry(row: { created_at: string; form_type: string; slack_posted_at: string | null; slack_error: string | null }, configuredTypes: Set<string>) {
  return row.created_at >= SLACK_TRACKING_START && configuredTypes.has(row.form_type) && (!row.slack_posted_at || row.slack_error != null);
}