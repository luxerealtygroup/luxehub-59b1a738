import { describe, expect, it } from 'vitest';
import { buildMessage, collectFiles } from '../supabase/functions/slack-post-submission/message';
import { needsSlackRetry, SLACK_TRACKING_START } from '../src/components/submissions/slackTracking';

describe('Slack submission tracking', () => {
  const row = { form_type:'listing', created_at:SLACK_TRACKING_START, slack_posted_at:null, slack_error:null };
  it('starts alerting at Nov 18 2026 19:30 UTC, not before', () => {
    expect(needsSlackRetry(row,new Set(['listing']))).toBe(true);
    expect(needsSlackRetry({ ...row,created_at:'2026-11-18T19:29:59Z' },new Set(['listing']))).toBe(false);
  });
  it('does not flag invoices without a configured channel', () => {
    expect(needsSlackRetry({ ...row,form_type:'invoice' },new Set(['listing','buyer','open_house']))).toBe(false);
  });
  it('flags posted submissions with file errors, not successful posts', () => {
    expect(needsSlackRetry({ ...row,slack_posted_at:SLACK_TRACKING_START,slack_error:'Missing permission' },new Set(['listing']))).toBe(true);
    expect(needsSlackRetry({ ...row,slack_posted_at:SLACK_TRACKING_START },new Set(['listing']))).toBe(false);
  });
  it('collects files from all six persisted locations without duplicates', () => {
    const files = collectFiles({ attachments:['a/a.pdf'],bra_reco_files:['b/b.pdf'],ids_files:['c/id.pdf'],fintracker_files:['d/d.pdf'],other_docs_files:[{ path:'e/e.pdf',name:'Other.pdf' }],invoice_file_path:'f/invoice.pdf' });
    expect(files.map(f => f.path)).toEqual(['a/a.pdf','b/b.pdf','c/id.pdf','d/d.pdf','e/e.pdf','f/invoice.pdf']);
    expect(collectFiles({ attachments:['a/a.pdf'],invoice_file_path:'a/a.pdf' })).toHaveLength(1);
  });
  it('omits empty fields, retains false/zero, and includes no legacy task URL or ID content', () => {
    const message = buildMessage({ id:'123',form_type:'listing',seller_names:'A Seller',list_price:0,staging_consult:false,notes:null,asana_task_url:'https://asana.test/task',ids_files:['private/id.pdf'] });
    expect(message.text).toContain('List price: $0');
    expect(message.text).toContain('Staging consult: No');
    expect(message.text).not.toContain('Notes:');
    expect(message.text).not.toContain('asana');
    expect(message.text).not.toContain('private/id.pdf');
  });
});