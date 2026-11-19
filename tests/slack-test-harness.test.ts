import { describe, expect, it } from 'vitest';
import { FORM_TYPES, runHarness, type HarnessDependencies } from '../supabase/functions/slack-test-harness/harness';

const dependencies = () => {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const deps: HarnessDependencies = {
    readGate: async () => 'fixture-gate',
    readDestinations: async () => FORM_TYPES.map(form_type => ({ org_id: 'fixture-org', form_type, channel_id: `C${form_type}` })),
    slack: async (method, body) => { calls.push({ method, body }); return { ok: true, channel: String(body.channel), ts: '123.456' }; },
  };
  return { deps, calls };
};
describe('temporary Slack harness', () => {
  it.each([null, '', 'wrong'])('rejects a missing or mismatched header before any Slack call: %s', async header => {
    const { deps, calls } = dependencies();
    expect((await runHarness(header, { delete: false }, deps)).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
  it('rejects an empty gate table', async () => {
    const { deps, calls } = dependencies(); deps.readGate = async () => null;
    expect((await runHarness('fixture-gate', { delete: false }, deps)).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
  it('fails closed when gate lookup errors', async () => {
    const { deps, calls } = dependencies(); deps.readGate = async () => { throw new Error('fixture'); };
    expect((await runHarness('fixture-gate', { delete: false }, deps)).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
  it('posts exactly one fake message per type and never deletes in post mode', async () => {
    const { deps, calls } = dependencies();
    const result = await runHarness('fixture-gate', { delete: false }, deps);
    expect(result.status).toBe(200);
    expect(calls.map(call => call.method)).toEqual(Array(4).fill('chat.postMessage'));
    expect(calls.map(call => call.body.channel)).toEqual(FORM_TYPES.map(type => `C${type}`));
    expect(result.body.results).toHaveLength(4);
    expect(result.body.results?.every(row => row.ok && row.ts === '123.456')).toBe(true);
  });
  it('delete mode deletes supplied messages without posting', async () => {
    const { deps, calls } = dependencies();
    await runHarness('fixture-gate', { delete: true, messages: [{ channel: 'CFAKE', ts: '123.456' }] }, deps);
    expect(calls).toEqual([{ method: 'chat.delete', body: { channel: 'CFAKE', ts: '123.456' } }]);
  });
  it('does not select an arbitrary brokerage if multiple orgs have destinations', async () => {
    const { deps, calls } = dependencies();
    deps.readDestinations = async () => [{ org_id: 'one', form_type: 'listing', channel_id: 'CONE' }, { org_id: 'two', form_type: 'listing', channel_id: 'CTWO' }];
    expect((await runHarness('fixture-gate', { delete: false }, deps)).body.error).toBe('Could not uniquely determine the harness brokerage.');
    expect(calls).toHaveLength(0);
  });
  it('returns individual failures while continuing once through the remaining types', async () => {
    const { deps, calls } = dependencies();
    deps.slack = async (method, body) => { calls.push({ method, body }); return { ok: false, error: 'channel_not_found' }; };
    const result = await runHarness('fixture-gate', { delete: false }, deps);
    expect(calls).toHaveLength(4);
    expect(result.body.results?.every(row => !row.ok && row.error === 'channel_not_found')).toBe(true);
  });
});