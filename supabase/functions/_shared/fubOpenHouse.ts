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
  fub_tier?: string | null;
  casl_consent?: boolean | null;
  casl_consent_at?: string | null;
  signed_in_at: string | null;
  client_captured_at: string | null;
  created_at: string;
}

export const VISITOR_COLUMNS =
  'id, first_name, last_name, email, phone, working_with_agent, agent_name, intent, ' +
  'has_home_to_sell, timeline, lender_status, custom_answers, notes, temperature, ' +
  'price_feedback, condition_feedback, interest_level, ' +
  'fub_contact_id, fub_stage, fub_tier, casl_consent, casl_consent_at, fub_sent_at, signed_in_at, client_captured_at, created_at';

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
  add('Follow-up tier', v.fub_tier);
  if (v.casl_consent) answers.push(`• CASL consent: yes${v.casl_consent_at ? ` (${new Date(v.casl_consent_at).toLocaleString('en-CA')})` : ''}`);
  else if (v.casl_consent === false) answers.push('• CASL consent: not given');
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

export interface HouseInfo {
  property_address: string;
  hosting_email: string | null;
  hosting_fub_user_id?: number | null;
  city?: string | null;
  mls_number?: string | null;
  list_price?: number | null;
  feature_sheet_url?: string | null;
}

export const EVENT_SOURCE = 'LUXEhub Open House';
export const EVENT_TYPE = 'Visited Open House';
export const WORKING_WITH_AGENT_TAG = 'Working with Another Agent';

/** The agent's fixed follow-up tiers. Each one becomes a Follow Up Boss tag. */
export const TIERS = [
  'Ready to Go', 'Pre-Approved', 'Early Stages', 'Hot Lead',
  'Warm Lead', 'Cool Lead', 'Nurture', 'OH – No Read',
] as const;

// ---- custom fields --------------------------------------------------------

const FIELD_SPECS = [
  { key: 'ownRent', labels: ['Own/Rent', 'Own or Rent', 'Own / Rent', 'OH Own/Rent'] },
  { key: 'preApproved', labels: ['Pre-Approved', 'Pre Approved', 'Preapproved', 'OH Pre-Approved'] },
  { key: 'workingWithAgent', labels: ['Working with an Agent', 'Working With Agent', 'Working with Agent', 'OH Working with an Agent'] },
  { key: 'featureSheet', labels: ['OH Feature Sheet'] },
] as const;
type FieldKey = typeof FIELD_SPECS[number]['key'];

const fieldCache = new Map<string, { at: number; map: Partial<Record<FieldKey, string>> }>();

/**
 * Resolve our four fields to the account's custom field API names. A field
 * that does not exist yet is created once as plain text; if the key lacks the
 * permission to create it, that field is simply skipped (the note still has it).
 */
export async function customFieldMap(key: string, cacheKey: string) {
  const hit = fieldCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.map;
  const res = await fub(key, '/customFields?limit=200');
  const list: any[] = res.ok ? res.body?.customfields ?? res.body?.customFields ?? [] : [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const map: Partial<Record<FieldKey, string>> = {};
  for (const spec of FIELD_SPECS) {
    const want = spec.labels.map(norm);
    const found = list.find((f) => want.includes(norm(String(f.label ?? ''))));
    if (found?.name) { map[spec.key] = String(found.name); continue; }
    const made = await fub(key, '/customFields', {
      method: 'POST',
      body: JSON.stringify({ label: spec.labels[0], type: 'text' }),
    });
    if (made.ok && made.body?.name) map[spec.key] = String(made.body.name);
  }
  fieldCache.set(cacheKey, { at: Date.now(), map });
  return map;
}

function fieldValues(v: Visitor, house: HouseInfo) {
  const ownRent = v.has_home_to_sell === 'yes' ? 'Own' : v.has_home_to_sell === 'no' ? 'Rent' :
    v.has_home_to_sell === 'unsure' ? 'Not sure' : null;
  const preApproved = v.lender_status === 'pre_approved' ? 'Yes' :
    v.lender_status === 'pre_qualified' ? 'Pre-qualified' :
    v.lender_status === 'not_yet' ? 'No' : v.lender_status === 'unsure' ? 'Not sure' : null;
  const working = v.working_with_agent === true
    ? `Yes${v.agent_name ? ` (${v.agent_name})` : ''}`
    : v.working_with_agent === false ? 'No' : null;
  return { ownRent, preApproved, workingWithAgent: working, featureSheet: house.feature_sheet_url || null };
}

function splitAddress(address: string, city?: string | null) {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  const street = parts[0] || address;
  const rest = parts.slice(1).join(' ');
  const code = (rest.match(/[A-Z]\d[A-Z]\s?\d[A-Z]\d/i) || [])[0] || undefined;
  const state = /\bON\b/.test(rest) ? 'ON' : undefined;
  const cityGuess = city || parts[1]?.replace(/\bON\b.*$/, '').trim() || undefined;
  return { street, city: cityGuess, state, code };
}

async function hostAgent(key: string, house: HouseInfo) {
  if (house.hosting_fub_user_id) {
    const res = await fub(key, `/users/${house.hosting_fub_user_id}`);
    if (res.ok && res.body?.id) return { id: Number(res.body.id), name: String(res.body.name || '') };
  }
  return findAgent(key, house.hosting_email);
}

/**
 * Send a guest to Follow Up Boss as an event (so the account's automations and
 * lead flow fire), then finish the contact one person at a time:
 * stage (guarded), tags, custom fields, assignment, and the sign-in note.
 * The tier tag is NOT sent here — that happens later in `applyTier`.
 */
export async function sendOne(
  key: string,
  v: Visitor,
  house: HouseInfo,
  stage: string,
  stages: Stage[],
  cacheKey = 'instance',
): Promise<{ ok: boolean; personId?: string; error?: string; stageResult?: string; eventId?: string }> {
  if (v.fub_sent_at && v.fub_contact_id) {
    return { ok: true, personId: v.fub_contact_id };
  }
  if (!v.phone && !v.email) {
    return { ok: false, error: 'No phone or email on this guest — Follow Up Boss needs one of them.' };
  }

  const address = house.property_address || 'Open House';
  const agent = await hostAgent(key, house);
  const tags = buildTags(v, address);
  const existing = await findPerson(key, v);

  const person: Record<string, unknown> = {
    firstName: v.first_name,
    lastName: v.last_name || '',
  };
  if (v.email) person.emails = [{ value: v.email }];
  if (v.phone) person.phones = [{ value: v.phone }];
  if (!existing) {
    person.stage = stage;
    person.tags = tags;
    if (agent) person.assignedUserId = agent.id;
  }
  const loc = splitAddress(address, house.city);
  const property: Record<string, unknown> = { street: loc.street, type: 'Open House' };
  if (loc.city) property.city = loc.city;
  if (loc.state) property.state = loc.state;
  if (loc.code) property.code = loc.code;
  if (house.mls_number) property.mlsNumber = house.mls_number;
  if (house.list_price) property.price = Number(house.list_price);
  if (house.feature_sheet_url) property.url = house.feature_sheet_url;

  const ev = await fub(key, '/events', {
    method: 'POST',
    body: JSON.stringify({
      source: EVENT_SOURCE,
      system: 'LUXEhub',
      type: EVENT_TYPE,
      message: `Signed in at the open house at ${address}`,
      description: buildNote(v, address, false),
      occurredAt: v.client_captured_at || v.signed_in_at || v.created_at,
      person,
      property,
    }),
  });
  if (!ev.ok) {
    return { ok: false, error: scrub(`Follow Up Boss event ${ev.status}: ${ev.text}`, key).slice(0, 500) };
  }
  let personId: string | null =
    (ev.body?.personId ?? ev.body?.person?.id ?? existing?.id ?? null) as string | null;
  if (!personId) {
    const again = await findPerson(key, v);
    personId = again?.id ? String(again.id) : null;
  }
  if (!personId) {
    return { ok: false, error: 'Follow Up Boss accepted the event but did not return the contact (lead flow may have archived it).' };
  }
  personId = String(personId);

  // Follow-up PUT: one person, never bulk.
  const current = await fub(key, `/people/${personId}?fields=id,stage,tags,assignedUserId`);
  const currentTags: string[] = current.body?.tags ?? [];
  const currentStage = current.body?.stage ? String(current.body.stage) : null;
  const followTags = [...tags];
  if (v.working_with_agent === true) followTags.push(WORKING_WITH_AGENT_TAG);
  const payload: Record<string, unknown> = {
    tags: Array.from(new Set([...currentTags, ...followTags])),
  };
  let stageResult = `Stage set to ${stage}`;
  if (existing) {
    const before = existing.stage ? String(existing.stage) : null;
    if (isUnworked(before, stages)) payload.stage = stage;
    else stageResult = `Stage left as ${before} — already being worked`;
  } else {
    if (currentStage?.toLowerCase() !== stage.toLowerCase()) payload.stage = stage;
    if (agent && Number(current.body?.assignedUserId) !== agent.id) payload.assignedUserId = agent.id;
  }
  try {
    const fields = await customFieldMap(key, cacheKey);
    const values = fieldValues(v, house);
    for (const [k, apiName] of Object.entries(fields)) {
      const val = values[k as FieldKey];
      if (apiName && val) payload[apiName] = val;
    }
  } catch { /* fields are best effort; the note carries the answers too */ }

  const upd = await fub(key, `/people/${personId}`, { method: 'PUT', body: JSON.stringify(payload) });
  if (!upd.ok) {
    return { ok: false, personId, error: scrub(`Follow Up Boss ${upd.status}: ${upd.text}`, key).slice(0, 500) };
  }

  return { ok: true, personId, stageResult, eventId: ev.body?.personId && ev.body?.id ? String(ev.body.id) : undefined };
}

/**
 * Apply the end-of-day tier as a tag on ONE person. Other tiers from the fixed
 * list are removed so a person carries exactly one. This is what starts the
 * agent's follow-up automation, so it is always its own PUT.
 */
export async function applyTier(
  key: string,
  personId: string,
  tier: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(TIERS as readonly string[]).includes(tier)) return { ok: false, error: 'Unknown tier.' };
  const person = await fub(key, `/people/${personId}?fields=id,tags`);
  if (!person.ok) {
    return { ok: false, error: scrub(`Follow Up Boss ${person.status}: ${person.text}`, key).slice(0, 500) };
  }
  const kept = ((person.body?.tags ?? []) as string[]).filter((t) => !(TIERS as readonly string[]).includes(t));
  const upd = await fub(key, `/people/${personId}`, {
    method: 'PUT',
    body: JSON.stringify({ tags: [...kept, tier] }),
  });
  if (!upd.ok) {
    return { ok: false, error: scrub(`Follow Up Boss ${upd.status}: ${upd.text}`, key).slice(0, 500) };
  }
  return { ok: true };
}

/**
 * Apply a stage the agent chose after the guest was already in Follow Up Boss.
 * Same guard as the first send: someone already being worked is left alone.
 */
export async function applyStage(
  key: string,
  personId: string,
  stage: string,
  stages: Stage[],
): Promise<{ ok: boolean; error?: string; stageResult?: string }> {
  const person = await fub(key, `/people/${personId}?fields=id,stage`);
  if (!person.ok) {
    return { ok: false, error: scrub(`Follow Up Boss ${person.status}: ${person.text}`, key).slice(0, 500) };
  }
  const currentStage = person.body?.stage ? String(person.body.stage) : null;
  if (currentStage && currentStage.toLowerCase() === stage.toLowerCase()) {
    return { ok: true, stageResult: `Stage set to ${stage}` };
  }
  if (!isUnworked(currentStage, stages)) {
    return { ok: true, stageResult: `Stage left as ${currentStage} — already being worked` };
  }
  const upd = await fub(key, `/people/${personId}`, {
    method: 'PUT',
    body: JSON.stringify({ stage }),
  });
  if (!upd.ok) {
    return { ok: false, error: scrub(`Follow Up Boss ${upd.status}: ${upd.text}`, key).slice(0, 500) };
  }
  return { ok: true, stageResult: `Stage set to ${stage}` };
}

/**
 * Demo and sample accounts must never reach the live CRM. An open house owned
 * or hosted by one of those accounts is skipped by every send path, so an App
 * Store reviewer poking around cannot create a real contact.
 */
export async function isDemoOpenHouse(
  db: { from: (t: string) => any },
  hostingAgentId: string | null | undefined,
  ownerId: string | null | undefined,
): Promise<boolean> {
  const ids = [hostingAgentId, ownerId].filter(Boolean) as string[];
  if (!ids.length) return false;
  const { data } = await db.from('profiles').select('member_type').in('id', ids);
  return ((data ?? []) as { member_type: string | null }[]).some(
    (p) => p.member_type === 'demo' || p.member_type === 'system',
  );
}
