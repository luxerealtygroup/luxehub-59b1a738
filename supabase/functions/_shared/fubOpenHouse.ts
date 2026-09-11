// Open house guests -> Follow Up Boss: the shared sending logic.
//
// Used by the interactive function (an agent pressing Send) and by the
// automatic sweep. Rules that must hold in both places:
//   - the API key is only ever read here, never logged or returned
//   - a guest already marked sent is never sent again (no duplicate people)
//   - an existing contact is never knocked backwards out of a worked stage
import { FUB_BASE_URL } from './fub.ts';

export const scrub = (text: string, secret: string) =>
  secret ? text.split(secret).join('[redacted]') : text;

function headers(key: string) {
  return {
    Authorization: 'Basic ' + btoa(`${key}:`),
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-System': 'Real Estate Hub',
    'X-System-Key': 'lovable-hub',
  };
}

export async function fub(key: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${FUB_BASE_URL}${path}`, { ...init, headers: headers(key) });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { ok: res.ok, status: res.status, body, text };
}

export async function testKey(key: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fub(key, '/identity');
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Follow Up Boss rejected that key (unauthorized).' };
    }
    if (!res.ok) return { ok: false, message: `Follow Up Boss returned ${res.status}.` };
    const name = res.body?.account?.name || res.body?.name;
    return { ok: true, message: name ? `Connected to ${name}` : 'Connected' };
  } catch (e) {
    return { ok: false, message: scrub(`Could not reach Follow Up Boss: ${(e as Error).message}`, key) };
  }
}

export interface Visitor {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  working_with_agent: boolean | null;
  agent_name: string | null;
  intent: string | null;
  has_home_to_sell: string | null;
  timeline: string | null;
  lender_status: string | null;
  custom_answers: Record<string, string> | null;
  notes: string | null;
  temperature: string | null;
  price_feedback: string | null;
  condition_feedback: string | null;
  interest_level: string | null;
  fub_contact_id: string | null;
  fub_sent_at: string | null;
  fub_stage: string | null;
  signed_in_at: string | null;
  client_captured_at: string | null;
  created_at: string;
}

export const VISITOR_COLUMNS =
  'id, first_name, last_name, email, phone, working_with_agent, agent_name, intent, ' +
  'has_home_to_sell, timeline, lender_status, custom_answers, notes, temperature, ' +
  'price_feedback, condition_feedback, interest_level, ' +
  'fub_contact_id, fub_stage, fub_sent_at, signed_in_at, client_captured_at, created_at';

const PRICE_LABEL: Record<string, string> = {
  priced_right: 'Priced right',
  slightly_high: 'Slightly high',
  too_high: 'Too high',
  below_market: 'Below market',
};

const CONDITION_LABEL: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  needs_work: 'Needs work',
};

const INTEREST_LABEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/**
 * Readable at a glance in Follow Up Boss: where and when, then their answers,
 * then their feedback, then the agent's own notes. Blank things are left out
 * entirely rather than printed as empty labels.
 */
export function buildNote(v: Visitor, address: string, update = false) {
  const when = v.client_captured_at || v.signed_in_at || v.created_at;
  const date = new Date(when).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });

  const out: string[] = [];
  out.push(update ? `Open house update — ${address}` : `Open house sign-in — ${address}`);
  out.push(`Signed in: ${date}`);

  const answers: string[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value) answers.push(`• ${label}: ${value}`);
  };
  add('Buying or selling', v.intent);
  add('Timeline', v.timeline);
  add('Lender', v.lender_status);
  add('Home to sell', v.has_home_to_sell);
  if (v.working_with_agent === true) {
    answers.push(`• Working with an agent: yes${v.agent_name ? ` (${v.agent_name})` : ''}`);
  } else if (v.working_with_agent === false) {
    answers.push('• Working with an agent: no');
  }
  add('Temperature', v.temperature);
  add('Interest level', v.interest_level ? INTEREST_LABEL[v.interest_level] ?? v.interest_level : null);
  for (const [q, a] of Object.entries(v.custom_answers ?? {})) {
    if (a) answers.push(`• ${q}: ${a}`);
  }
  if (answers.length) {
    out.push('', 'THEIR ANSWERS', ...answers);
  }

  const feedback: string[] = [];
  if (v.price_feedback) {
    feedback.push(`• Price: ${PRICE_LABEL[v.price_feedback] ?? v.price_feedback}`);
  }
  if (v.condition_feedback) {
    feedback.push(`• Condition: ${CONDITION_LABEL[v.condition_feedback] ?? v.condition_feedback}`);
  }
  if (feedback.length) {
    out.push('', 'FEEDBACK ON THE HOME', ...feedback);
  }

  if (v.notes && v.notes.trim()) {
    out.push('', "AGENT'S NOTES", v.notes.trim());
  }

  return out.join('\n');
}

/**
 * One source for everyone ('Open House'); the property lives in a tag so the
 * account does not grow a source label per listing.
 */
export function buildTags(v: Visitor, address: string) {
  const tags = ['Open House'];
  if (address) tags.push(`Open House - ${address}`);
  if (v.temperature) tags.push(`Open House ${v.temperature[0].toUpperCase()}${v.temperature.slice(1)}`);
  if (v.has_home_to_sell === 'yes') tags.push('Has Home To Sell');
  else if (v.has_home_to_sell === 'no') tags.push('No Home To Sell');
  return tags;
}

// ---- stages ---------------------------------------------------------------

export interface Stage { id: number; name: string }

const stageCache = new Map<string, { at: number; stages: Stage[] }>();
const STAGE_CACHE_MS = 5 * 60 * 1000;

export async function getStages(key: string, cacheKey: string): Promise<Stage[]> {
  const hit = stageCache.get(cacheKey);
  if (hit && Date.now() - hit.at < STAGE_CACHE_MS) return hit.stages;
  const res = await fub(key, '/stages?limit=100');
  if (!res.ok) throw new Error(`Could not load the Follow Up Boss stage list (${res.status}).`);
  const stages: Stage[] = (res.body?.stages ?? [])
    .filter((s: any) => s?.name)
    .map((s: any) => ({ id: Number(s.id), name: String(s.name) }));
  stageCache.set(cacheKey, { at: Date.now(), stages });
  return stages;
}

/** Entry stages we are allowed to move someone out of. Anything else is real work. */
const UNWORKED = /^(lead|new lead|new leads?|contact|contacted|inquiry|unworked|new|prospect)$/i;

export function isUnworked(current: string | null | undefined, stages: Stage[]) {
  const name = (current || '').trim();
  if (!name) return true;
  if (UNWORKED.test(name)) return true;
  const first = stages[0]?.name;
  return Boolean(first && first.toLowerCase() === name.toLowerCase());
}

/** Find a Follow Up Boss user whose email matches the hosting agent. */
export async function findAgent(key: string, email: string | null) {
  if (!email) return null;
  const res = await fub(key, `/users?limit=100`);
  if (!res.ok) return null;
  const users: any[] = res.body?.users ?? [];
  const hit = users.find((u) => String(u.email || '').toLowerCase() === email.toLowerCase());
  return hit ? { id: hit.id as number, name: String(hit.name || '') } : null;
}

async function findPerson(key: string, v: Visitor) {
  const digits = (v.phone || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    const res = await fub(key, `/people?phone=${encodeURIComponent(digits)}&limit=1`);
    const hit = res.body?.people?.[0];
    if (hit?.id) return hit;
  }
  if (v.email) {
    const res = await fub(key, `/people?email=${encodeURIComponent(v.email)}&limit=1`);
    const hit = res.body?.people?.[0];
    if (hit?.id) return hit;
  }
  return null;
}

/** Appends a fresh note. Never touches the person's stage, source or assignment. */
export async function postNote(
  key: string,
  personId: string,
  v: Visitor,
  address: string,
  update: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fub(key, '/notes', {
    method: 'POST',
    body: JSON.stringify({
      personId: Number(personId),
      subject: update ? `Open House update — ${address}` : `Open House — ${address}`,
      body: buildNote(v, address, update),
      isHtml: false,
    }),
  });
  if (!res.ok) {
    return { ok: false, error: scrub(`Note failed (${res.status}): ${res.text}`, key).slice(0, 500) };
  }
  return { ok: true };
}

export async function sendOne(
  key: string,
  v: Visitor,
  house: { property_address: string; hosting_email: string | null },
  stage: string,
  stages: Stage[],
): Promise<{ ok: boolean; personId?: string; error?: string; stageResult?: string }> {
  if (v.fub_sent_at && v.fub_contact_id) {
    return { ok: true, personId: v.fub_contact_id };
  }
  if (!v.phone && !v.email) {
    return { ok: false, error: 'No phone or email on this guest — Follow Up Boss needs one of them.' };
  }

  const address = house.property_address || 'Open House';
  const agent = await findAgent(key, house.hosting_email);
  const tags = buildTags(v, address);

  let personId: string | null = null;
  let stageResult = `Stage set to ${stage}`;
  const existing = await findPerson(key, v);

  if (existing) {
    personId = String(existing.id);
    const merged = Array.from(new Set([...(existing.tags ?? []), ...tags]));
    const currentStage = existing.stage ? String(existing.stage) : null;
    const payload: Record<string, unknown> = { tags: merged };
    // Never knock an already-worked contact backwards.
    if (isUnworked(currentStage, stages)) {
      payload.stage = stage;
    } else {
      stageResult = `Stage left as ${currentStage} — already being worked`;
    }
    const upd = await fub(key, `/people/${personId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!upd.ok) return { ok: false, error: scrub(`Follow Up Boss ${upd.status}: ${upd.text}`, key).slice(0, 500) };
  } else {
    const body: Record<string, unknown> = {
      firstName: v.first_name,
      lastName: v.last_name || '',
      source: 'Open House',
      stage,
      tags,
    };
    if (v.email) body.emails = [{ value: v.email }];
    if (v.phone) body.phones = [{ value: v.phone }];
    if (agent) {
      body.assignedUserId = agent.id;
      if (agent.name) body.assignedTo = agent.name;
    }
    const created = await fub(key, '/people?deduplicate=true', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!created.ok || !created.body?.id) {
      return { ok: false, error: scrub(`Follow Up Boss ${created.status}: ${created.text}`, key).slice(0, 500) };
    }
    personId = String(created.body.id);
  }

  const note = await postNote(key, personId!, v, address, false);
  if (!note.ok) return { ok: false, error: note.error };

  return { ok: true, personId: personId!, stageResult };
}
