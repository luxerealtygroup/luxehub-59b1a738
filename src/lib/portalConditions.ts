/**
 * Conditions on a portal transaction (Ontario APS conditions).
 *
 * Entered by hand in LUXEhub — there is deliberately no Follow Up Boss
 * dependency here, because FUB has no condition model.
 */

export type ConditionStatus = 'outstanding' | 'waived' | 'fulfilled' | 'not_met';
export type ResponsibleParty = 'client' | 'agent' | 'lawyer' | 'lender';

export interface PortalCondition {
  id: string;
  portal_id: string;
  transaction_id: string;
  condition_type: string;
  custom_label: string | null;
  due_date: string | null;
  status: ConditionStatus;
  resolved_date: string | null;
  responsible_party: ResponsibleParty;
  display_order: number;
  created_at: string;
}

export interface ConditionNote {
  id: string;
  condition_id: string;
  portal_id: string;
  body: string;
  is_internal: boolean;
}

/** Ontario condition types, with the party that usually owns each one. */
export const CONDITION_TYPES: {
  value: string;
  label: string;
  party: ResponsibleParty;
  /** Typical number of days from acceptance — used only as a default. */
  days: number;
}[] = [
  { value: 'financing', label: 'Financing', party: 'lender', days: 5 },
  { value: 'home_inspection', label: 'Home inspection', party: 'client', days: 5 },
  { value: 'status_certificate', label: 'Status certificate review', party: 'lawyer', days: 10 },
  { value: 'sale_of_property', label: "Sale of buyer's existing property", party: 'client', days: 30 },
  { value: 'insurance', label: 'Insurance', party: 'client', days: 5 },
  { value: 'water_septic', label: 'Water potability / septic / well', party: 'client', days: 7 },
  { value: 'solicitor_review', label: 'Solicitor review', party: 'lawyer', days: 5 },
  { value: 'other', label: 'Other', party: 'client', days: 5 },
];

export const CONDITION_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CONDITION_TYPES.map((c) => [c.value, c.label]),
);

export const PARTY_LABEL: Record<ResponsibleParty, string> = {
  client: 'Client',
  agent: 'Agent',
  lawyer: 'Lawyer',
  lender: 'Lender',
};

export const STATUS_LABEL: Record<ConditionStatus, string> = {
  outstanding: 'Outstanding',
  waived: 'Waived',
  fulfilled: 'Fulfilled',
  not_met: 'Not met',
};

/** Waived / fulfilled conditions are done: they render complete and stop counting down. */
export const isSettled = (s: ConditionStatus) => s === 'waived' || s === 'fulfilled';

export function conditionLabel(c: Pick<PortalCondition, 'condition_type' | 'custom_label'>) {
  if (c.condition_type === 'other') return c.custom_label?.trim() || 'Other condition';
  return c.custom_label?.trim() || CONDITION_TYPE_LABEL[c.condition_type] || c.condition_type;
}

/** Whole days from today until the date; negative when it has passed. */
export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${date}T00:00:00`);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** "in 3 days" / "today" / "2 days overdue" */
export function countdownLabel(date: string | null): string | null {
  const n = daysUntil(date);
  if (n === null) return null;
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n > 1) return `${n} days`;
  if (n === -1) return '1 day overdue';
  return `${Math.abs(n)} days overdue`;
}

export const isOverdue = (c: Pick<PortalCondition, 'due_date' | 'status'>) =>
  !isSettled(c.status) && c.status !== 'not_met' && (daysUntil(c.due_date) ?? 99) < 0;

export const isDueSoon = (c: Pick<PortalCondition, 'due_date' | 'status'>) => {
  if (isSettled(c.status) || c.status === 'not_met') return false;
  const n = daysUntil(c.due_date);
  return n !== null && n >= 0 && n <= 3;
};

/** Default due date for a freshly logged condition: today + the type's typical days. */
export function defaultDueDate(type: string): string {
  const days = CONDITION_TYPES.find((c) => c.value === type)?.days ?? 5;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The standing disclaimer shown to clients on every conditions timeline. */
export const APS_DISCLAIMER =
  'Dates shown here are for convenience only. Your Agreement of Purchase and Sale is the governing document for every deadline — check it, and speak to your agent or lawyer if anything differs.';
