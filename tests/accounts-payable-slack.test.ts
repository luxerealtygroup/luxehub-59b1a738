import { describe, expect, it } from 'vitest';
import { canSendInvoiceToSlack, invoiceSlackStatus } from '../src/components/accountsPayableSlack';

describe('Accounts Payable Slack rules', () => {
  it('does not offer send for unposted invoices before Nov 19 2026', () => {
    expect(canSendInvoiceToSlack({ created_at: '2026-11-18T23:59:00Z', slack_posted_at: null, slack_error: null })).toBe(false);
  });
  it('offers send for unposted invoices from Nov 19 2026', () => {
    expect(canSendInvoiceToSlack({ created_at: '2026-11-19T00:00:00Z', slack_posted_at: null, slack_error: null })).toBe(true);
  });
  it('offers send for any invoice with a Slack error', () => {
    expect(canSendInvoiceToSlack({ created_at: '2026-01-01T00:00:00Z', slack_posted_at: null, slack_error: 'x' })).toBe(true);
  });
  it('does not offer send once posted', () => {
    expect(canSendInvoiceToSlack({ created_at: '2026-11-20T00:00:00Z', slack_posted_at: '2026-11-20T00:01:00Z', slack_error: null })).toBe(false);
  });
  it('labels a posted invoice without error as posted', () => {
    expect(invoiceSlackStatus({ created_at: '', slack_posted_at: 'x', slack_error: null })).toBe('posted');
  });
});
