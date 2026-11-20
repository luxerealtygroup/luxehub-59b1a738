/** Slack go-live for invoice delivery; older invoices must never be bulk-posted. */
export const SLACK_GO_LIVE = '2026-11-19T00:00:00Z';

export interface InvoiceSlackFields { created_at: string; slack_posted_at: string | null; slack_error: string | null }

export function invoiceSlackStatus(r: InvoiceSlackFields): 'posted' | 'error' | 'not_posted' {
  if (r.slack_error) return 'error';
  if (r.slack_posted_at) return 'posted';
  return 'not_posted';
}

export function canSendInvoiceToSlack(r: InvoiceSlackFields): boolean {
  if (r.slack_error) return true;
  return !r.slack_posted_at && new Date(r.created_at).getTime() >= new Date(SLACK_GO_LIVE).getTime();
}
