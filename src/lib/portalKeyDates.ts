/**
 * Agent-entered extra dates on a client portal (inspection, open house, other).
 *
 * Conditions and closing dates come from the transaction/conditions records —
 * this table only holds the one-off dates an agent adds by hand, optionally
 * with a time of day.
 */

export type KeyDateKind = 'inspection' | 'open_house' | 'appraisal' | 'signing' | 'walkthrough' | 'other';

export interface PortalKeyDate {
  id: string;
  portal_id: string;
  property_id: string | null;
  transaction_id: string | null;
  kind: KeyDateKind;
  custom_label: string | null;
  event_date: string;
  event_time: string | null;
  notes: string | null;
  is_internal: boolean;
}

export const KEY_DATE_KINDS: { value: KeyDateKind; label: string }[] = [
  { value: 'inspection', label: 'Inspection' },
  { value: 'open_house', label: 'Open house' },
  { value: 'appraisal', label: 'Appraisal' },
  { value: 'signing', label: 'Signing appointment' },
  { value: 'walkthrough', label: 'Final walkthrough' },
  { value: 'other', label: 'Other' },
];

export const KEY_DATE_KIND_LABEL: Record<string, string> = Object.fromEntries(
  KEY_DATE_KINDS.map((k) => [k.value, k.label]),
);

export function keyDateLabel(d: Pick<PortalKeyDate, 'kind' | 'custom_label'>) {
  if (d.custom_label?.trim()) return d.custom_label.trim();
  return KEY_DATE_KIND_LABEL[d.kind] ?? 'Date';
}

/** "2:30 PM" from a Postgres time value like "14:30:00". */
export function formatEventTime(time: string | null) {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, '0')} ${suffix}`;
}
