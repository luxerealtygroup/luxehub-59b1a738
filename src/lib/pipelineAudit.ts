import { supabase } from '@/integrations/supabase/client';

/**
 * Audit trail for edits made to somebody else's client. Insert-only: the agent
 * who owns the client can always see what was changed and by whom.
 *
 * The assigned agent (`user_id`) is deliberately not an auditable field — it is
 * never editable from any of these screens, so commission attribution cannot
 * move to whoever happens to be doing the admin work.
 */
export type AuditField =
  | 'stage'
  | 'client_type'
  | 'expected_pending_date'
  | 'projected_sale_amount'
  | 'projected_gci'
  | 'property_address'
  | 'fub_deal'
  | 'added_by';

export interface ClientAuditEntry {
  id: string;
  client_id: string;
  owner_user_id: string;
  changed_by: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

interface Change {
  field: AuditField;
  old_value: string | null;
  new_value: string | null;
}

/**
 * Records changes only when the editor is not the client's own agent —
 * an agent working their own book does not need to be audited.
 */
export async function logClientChanges(params: {
  clientId: string;
  ownerUserId: string;
  actorId: string;
  changes: Change[];
}) {
  const { clientId, ownerUserId, actorId, changes } = params;
  if (actorId === ownerUserId) return;
  const rows = changes
    .filter((c) => (c.old_value ?? '') !== (c.new_value ?? ''))
    .map((c) => ({
      client_id: clientId,
      owner_user_id: ownerUserId,
      changed_by: actorId,
      field: c.field,
      old_value: c.old_value,
      new_value: c.new_value,
    }));
  if (!rows.length) return;
  const { error } = await supabase.from('pipeline_client_audit').insert(rows);
  if (error) console.error('Failed to write client audit entry:', error);
}

/** Diff of the fields we track, as plain strings. */
export function diffClientFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Change[] {
  const fields: AuditField[] = [
    'stage',
    'client_type',
    'expected_pending_date',
    'projected_sale_amount',
    'projected_gci',
    'property_address',
  ];
  return fields.map((f) => ({
    field: f,
    old_value: before[f] == null ? null : String(before[f]),
    new_value: after[f] == null ? null : String(after[f]),
  }));
}

const STAGE_NAMES: Record<string, string> = {
  1: 'Lead',
  2: 'Active on MLS',
  3: 'Exclusive Listing',
  4: 'BRA Signed',
  5: 'Appointment Held',
  6: 'Appointment Set',
  7: 'Showing',
  8: 'Offer',
  9: 'Pending',
  10: 'Closed',
};

const FIELD_LABELS: Record<string, string> = {
  stage: 'Stage',
  client_type: 'Client type',
  expected_pending_date: 'Expected pending date',
  projected_sale_amount: 'Projected value',
  projected_gci: 'Projected GCI',
  property_address: 'Property address',
  fub_deal: 'Follow Up Boss deal',
  added_by: 'Added to this agent by another user',
};

/** Plain-English one-liner for an audit row. */
export function describeAudit(entry: ClientAuditEntry): string {
  const label = FIELD_LABELS[entry.field] ?? entry.field;
  const pretty = (v: string | null) =>
    v == null || v === ''
      ? 'nothing'
      : entry.field === 'stage'
        ? STAGE_NAMES[v] ?? v
        : v;
  return `${label}: ${pretty(entry.old_value)} → ${pretty(entry.new_value)}`;
}
