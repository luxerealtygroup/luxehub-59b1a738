/**
 * Shared vocabulary for the open house sign-in flow.
 * Values match the database CHECK constraints on open_house_visitors.
 */

export type Intent = 'buying' | 'selling' | 'both' | 'just_looking' | 'neighbour';
export type HasHomeToSell = 'yes' | 'no' | 'unsure';
export type Timeline = 'now' | '1_3_months' | '3_6_months' | '6_12_months' | '12_plus_months' | 'unsure';
export type LenderStatus = 'pre_approved' | 'pre_qualified' | 'not_yet' | 'unsure';

export const INTENT_OPTIONS: { value: Intent; label: string }[] = [
  { value: 'buying', label: 'Buying' },
  { value: 'selling', label: 'Selling' },
  { value: 'both', label: 'Both' },
  { value: 'just_looking', label: 'Just looking' },
  { value: 'neighbour', label: 'Neighbour' },
];

export const HOME_TO_SELL_OPTIONS: { value: HasHomeToSell; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure' },
];

export const TIMELINE_OPTIONS: { value: Timeline; label: string }[] = [
  { value: 'now', label: 'Right now' },
  { value: '1_3_months', label: '1–3 months' },
  { value: '3_6_months', label: '3–6 months' },
  { value: '6_12_months', label: '6–12 months' },
  { value: '12_plus_months', label: '12+ months' },
  { value: 'unsure', label: 'Not sure' },
];

export const LENDER_OPTIONS: { value: LenderStatus; label: string }[] = [
  { value: 'pre_approved', label: 'Pre-approved' },
  { value: 'pre_qualified', label: 'Pre-qualified' },
  { value: 'not_yet', label: 'Not yet' },
  { value: 'unsure', label: 'Not sure' },
];

export const YES_NO_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/** Digits only. */
export function digits(value: string): string {
  return (value || '').replace(/\D/g, '');
}

/** North-American 10-digit check, tolerant of a leading 1. */
export function isValidPhone(value: string): boolean {
  const d = digits(value);
  return d.length === 10 || (d.length === 11 && d.startsWith('1'));
}

/** (519) 555-0134 as the visitor types. */
export function formatPhone(value: string): string {
  const d = digits(value).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
export function isValidEmail(value: string): boolean {
  const v = (value || '').trim();
  return v.length > 0 && v.length <= 254 && EMAIL_RE.test(v);
}

const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Short, URL-safe, unambiguous code for a sign-in link. */
export function makeSlug(length = 7): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join('');
}

/** Absolute sign-in URL for a slug. */
export function signInUrl(slug: string): string {
  return `${window.location.origin}/oh/${slug}`;
}

export function kioskUrl(slug: string): string {
  return `${signInUrl(slug)}?kiosk=1`;
}

export function agentUrl(agentSlug: string): string {
  return `${window.location.origin}/oh/agent/${agentSlug}`;
}
