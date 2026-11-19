import { buildMessage } from '../_shared/submissionSlackMessage.ts';

export const FORM_TYPES = ['listing', 'buyer', 'open_house', 'invoice'] as const;
export type HarnessBody = { delete: false } | { delete: true; messages: { channel: string; ts: string }[] };
export type Destination = { org_id: string; form_type: string; channel_id: string | null };
export type SlackResult = { ok: boolean; channel?: string; ts?: string; error?: string };
export interface HarnessDependencies {
  readGate(): Promise<string | null>;
  readDestinations(): Promise<Destination[]>;
  slack(method: 'chat.postMessage' | 'chat.delete', body: Record<string, unknown>): Promise<SlackResult>;
}

const PREFIX = 'TEST, please ignore';
export function fakeMessage(form_type: string) {
  const row = {
    id: `${PREFIX} — fake submission`, form_type,
    agent_name: `${PREFIX} — Test Person`, client_name: `${PREFIX} — Test Person`,
    property_address: `${PREFIX} — 000 Test Street`, submission_type: `${PREFIX} — fake test`,
    seller_names: `${PREFIX} — Test Person`, buyer_names: `${PREFIX} — Test Person`,
    vendor_type: `${PREFIX} — fake vendor`, vendor_name: `${PREFIX} — Test Person`,
    notes: `${PREFIX} — temporary harness; no real submission or files`,
  };
  const message = buildMessage(row);
  // Keep the shared formatter byte-for-byte unchanged; mark this harness's header only.
  const header = message.blocks[0];
  if (header) {
    const text = header.text as { type: string; text: string };
    header.text = { ...text, text: `${PREFIX} — ${text.text}` };
  }
  return { ...message, text: `${PREFIX}\n${message.text}` };
}

export async function runHarness(header: string | null, body: HarnessBody, deps: HarnessDependencies) {
  let expected: string | null = null;
  try { expected = await deps.readGate(); } catch { /* fail closed */ }
  if (!expected || !header || header !== expected) return { status: 401, body: { error: 'Unauthorized' } };
  if (body.delete) {
    const results = [];
    for (const message of body.messages) {
      let result: SlackResult;
      try { result = await deps.slack('chat.delete', message); }
      catch { result = { ok: false, error: 'Slack request failed.' }; }
      results.push({ ...message, ok: result.ok, error: result.error ?? null });
    }
    return { status: 200, body: { results } };
  }
  let destinations: Destination[];
  try { destinations = await deps.readDestinations(); }
  catch { return { status: 200, body: { error: 'Could not load Slack destinations.' } }; }
  const orgIds = [...new Set(destinations.map(row => row.org_id))];
  if (orgIds.length !== 1) return { status: 200, body: { error: 'Could not uniquely determine the harness brokerage.' } };
  const results = [];
  for (const form_type of FORM_TYPES) {
    const rows = destinations.filter(row => row.form_type === form_type && row.org_id === orgIds[0]);
    const channel = rows.length === 1 ? rows[0]?.channel_id ?? null : null;
    if (!channel) {
      results.push({ form_type, channel, ts: null, ok: false, error: 'No destination configured.' });
      continue;
    }
    let result: SlackResult;
    try { result = await deps.slack('chat.postMessage', { channel, ...fakeMessage(form_type), unfurl_links: false, unfurl_media: false }); }
    catch { result = { ok: false, error: 'Slack request failed.' }; }
    results.push({ form_type, channel: result.channel ?? channel, ts: result.ts ?? null, ok: result.ok, error: result.error ?? null });
  }
  return { status: 200, body: { results } };
}