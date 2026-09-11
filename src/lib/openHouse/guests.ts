/**
 * One guest list, one count.
 *
 * Everyone at an open house lives in `open_house_visitors`, whether they typed
 * their own details on the tablet (`source: 'visitor'`) or the agent logged
 * them from conversation (`source: 'agent'`). Feedback fields are available on
 * every row regardless of how it arrived.
 */

export type GuestSource = 'visitor' | 'agent';
export type GuestAttendance = 'during' | 'early' | 'late';
export type Temperature = 'hot' | 'warm' | 'cold';
export type InterestLevel = 'high' | 'medium' | 'low';
export type PriceFeedback = 'priced_right' | 'slightly_high' | 'too_high' | 'below_market';
export type ConditionFeedback = 'excellent' | 'good' | 'fair' | 'needs_work';

export interface Guest {
  id: string;
  open_house_id: string;
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
  source: GuestSource;
  temperature: Temperature | null;
  interest_level: InterestLevel | null;
  price_feedback: PriceFeedback | null;
  condition_feedback: ConditionFeedback | null;
  fub_contact_id: string | null;
  fub_linked: boolean;
  fub_sent_at: string | null;
  fub_sync_error: string | null;
  fub_stage: string | null;
  fub_stage_result: string | null;
  fub_note_updated_at: string | null;
  fub_attempts: number | null;
  fub_next_attempt_at: string | null;
  fub_note_due_at: string | null;
  updated_at: string | null;
  report_token: string | null;
  featured_listings: { address: string; price: number | null; photo_url: string | null; link: string | null }[] | null;
  follow_up_sent_at: string | null;
  follow_up_channel: string | null;
  signed_in_at: string | null;
  client_captured_at: string | null;
  created_at: string;
  /** Did they sign in inside the open house window? Early/late still count as leads, not attendance. */
  attendance: GuestAttendance;
}

export const GUEST_COLUMNS =
  'id, open_house_id, first_name, last_name, email, phone, working_with_agent, agent_name, ' +
  'intent, has_home_to_sell, timeline, lender_status, custom_answers, notes, source, temperature, ' +
  'interest_level, price_feedback, condition_feedback, fub_contact_id, fub_linked, ' +
  'fub_sent_at, fub_sync_error, fub_stage, fub_stage_result, fub_note_updated_at, ' +
  'fub_attempts, fub_next_attempt_at, fub_note_due_at, updated_at, attendance, ' +
  'report_token, featured_listings, follow_up_sent_at, follow_up_channel, signed_in_at, client_captured_at, created_at';

export const ATTENDANCE_LABEL: Record<Exclude<GuestAttendance, 'during'>, string> = {
  early: 'Early registration',
  late: 'Late registration',
};

export const PRICE_LABEL: Record<PriceFeedback, string> = {
  priced_right: 'Priced right',
  slightly_high: 'Slightly high',
  too_high: 'Too high',
  below_market: 'Below market',
};

export const CONDITION_LABEL: Record<ConditionFeedback, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  needs_work: 'Needs work',
};

export const INTEREST_LABEL: Record<InterestLevel, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const TEMPERATURE_OPTIONS: { value: Temperature; label: string }[] = [
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
];

/**
 * True when the guest has changed on our side since the last note we posted —
 * usually feedback typed after they were already sent.
 */
export function fubNoteStale(g: Pick<Guest, 'fub_sent_at' | 'fub_note_updated_at' | 'updated_at'>): boolean {
  if (!g.fub_sent_at || !g.updated_at) return false;
  const synced = g.fub_note_updated_at || g.fub_sent_at;
  return new Date(g.updated_at).getTime() > new Date(synced).getTime() + 1000;
}

/** Give up quietly after this many tries and show the agent the reason. */
export const FUB_MAX_ATTEMPTS = 8;

export type FubState = 'sent' | 'waiting' | 'retrying' | 'stuck';

/** What is happening with this guest and Follow Up Boss, in one word. */
export function fubState(g: Pick<Guest, 'fub_sent_at' | 'fub_sync_error' | 'fub_attempts'>): FubState {
  if (g.fub_sent_at) return 'sent';
  const attempts = g.fub_attempts ?? 0;
  if (attempts >= FUB_MAX_ATTEMPTS) return 'stuck';
  if (g.fub_sync_error) return 'retrying';
  return 'waiting';
}

export function guestName(g: Pick<Guest, 'first_name' | 'last_name'>): string {
  return [g.first_name, g.last_name].filter(Boolean).join(' ').trim() || 'Guest';
}

export function guestTime(g: Guest): string {
  const stamp = g.client_captured_at || g.signed_in_at || g.created_at;
  try {
    return new Date(stamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** The five things that make a guest worth following up on. */
export const COMPLETENESS_FIELDS = [
  'intent',
  'timeline',
  'lender_status',
  'has_home_to_sell',
  'working_with_agent',
] as const;

export type CompletenessField = (typeof COMPLETENESS_FIELDS)[number];

const MISSING_PHRASE: Record<CompletenessField, string> = {
  intent: 'whether they are buying or selling',
  timeline: 'their timeline',
  lender_status: 'whether they have spoken to a lender',
  has_home_to_sell: 'whether they have a home to sell',
  working_with_agent: 'whether they are working with an agent',
};

export function missingFields(g: Guest): CompletenessField[] {
  return COMPLETENESS_FIELDS.filter((f) => {
    const v = g[f];
    return v === null || v === undefined || v === '';
  });
}

/** A plain prompt the host can act on while the visitor is still in the house. */
export function missingPrompt(g: Guest): string | null {
  const missing = missingFields(g);
  if (missing.length === 0) return null;
  const phrases = missing.map((f) => MISSING_PHRASE[f]);
  const list =
    phrases.length === 1
      ? phrases[0]
      : `${phrases.slice(0, -1).join(', ')} or ${phrases[phrases.length - 1]}`;
  return `You still don't know ${list}.`;
}

// ---------------------------------------------------------------------------
// Follow-up messages — the device's own SMS and email apps, no provider, no cost
// ---------------------------------------------------------------------------

export const FOLLOWUP_SMS_KEY = 'open_house_followup_sms';
export const FOLLOWUP_EMAIL_SUBJECT_KEY = 'open_house_followup_email_subject';
export const FOLLOWUP_EMAIL_BODY_KEY = 'open_house_followup_email_body';

export const DEFAULT_SMS_TEMPLATE =
  'Hi {first_name}, it was great meeting you at {address} today. Here are homes like it: {report_link} — any questions, just text me back. — {agent_name}';

export const DEFAULT_EMAIL_SUBJECT = 'Great meeting you at {address}';

export const DEFAULT_EMAIL_BODY =
  'Hi {first_name},\n\nThank you for coming through {address} today — it was a pleasure meeting you.\n\nIf you would like the full listing details, comparable sales nearby, or a look at anything else on the market, just reply to this email and I will send it over.\n\nIn the meantime, here are homes like this one:\n{report_link}\n\nBest,\n{agent_name}';

export function fillTemplate(
  template: string,
  values: { first_name: string; address: string; agent_name: string; report_link?: string },
): string {
  return template
    .replace(/\{first_name\}/g, values.first_name)
    .replace(/\{address\}/g, values.address)
    .replace(/\{agent_name\}/g, values.agent_name)
    .replace(/\s*\{report_link\}/g, values.report_link ? ` ${values.report_link}` : '');
}

/** iOS wants `&body=`, Android wants `?body=`; `?` works on both modern platforms. */
export function smsHref(phone: string, body: string): string {
  const digitsOnly = phone.replace(/[^\d+]/g, '');
  return `sms:${digitsOnly}?&body=${encodeURIComponent(body)}`;
}

export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
