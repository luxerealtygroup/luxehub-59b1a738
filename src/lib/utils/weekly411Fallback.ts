/**
 * Merges Goal Tracking fields from weekly_411 as fallback for activity fields.
 *
 * If a specific activity field (e.g. dials) is 0/null but the corresponding
 * goal tracking field (e.g. calls_actual) has a value, we use the goal tracking value.
 *
 * This avoids double-counting: if the activity field already has data,
 * the goal tracking field is ignored (assumed already reflected).
 *
 * Mapping:
 *   dials           ← calls_actual
 *   appointments_held ← appointments_actual
 *   contracts_signed  ← contracts_actual
 */

interface Weekly411Row {
  dials?: number | null;
  contacts_made?: number | null;
  appointments_set?: number | null;
  appointments_held?: number | null;
  pipeline_additions?: number | null;
  contracts_signed?: number | null;
  firm_deals?: number | null;
  doors_knocked?: number | null;
  database_size?: number | null;
  calls_actual?: number | null;
  appointments_actual?: number | null;
  listings_actual?: number | null;
  contracts_actual?: number | null;
}

export interface Normalized411Row {
  dials: number;
  contacts_made: number;
  appointments_set: number;
  appointments_held: number;
  pipeline_additions: number;
  contracts_signed: number;
  firm_deals: number;
  doors_knocked: number;
  database_size: number;
}

const val = (v: number | null | undefined): number => v || 0;

/**
 * Returns normalized activity numbers for a single weekly_411 row,
 * applying goal-tracking fallbacks where activity fields are empty.
 */
export function normalize411Row(row: Weekly411Row): Normalized411Row {
  const dials = val(row.dials) || val(row.calls_actual);
  const appointmentsHeld = val(row.appointments_held) || val(row.appointments_actual);
  const contractsSigned = val(row.contracts_signed) || val(row.contracts_actual);

  return {
    dials,
    contacts_made: val(row.contacts_made),
    appointments_set: val(row.appointments_set) || val(row.appointments_actual),
    appointments_held: appointmentsHeld,
    pipeline_additions: val(row.pipeline_additions),
    contracts_signed: contractsSigned,
    firm_deals: val(row.firm_deals),
    doors_knocked: val(row.doors_knocked),
    database_size: val(row.database_size),
  };
}

/**
 * Aggregates an array of weekly_411 rows into totals with fallback logic applied.
 */
export function aggregate411Rows(rows: Weekly411Row[]): Normalized411Row {
  const totals: Normalized411Row = {
    dials: 0, contacts_made: 0, appointments_set: 0, appointments_held: 0,
    pipeline_additions: 0, contracts_signed: 0, firm_deals: 0, doors_knocked: 0, database_size: 0,
  };

  for (const row of rows) {
    const n = normalize411Row(row);
    totals.dials += n.dials;
    totals.contacts_made += n.contacts_made;
    totals.appointments_set += n.appointments_set;
    totals.appointments_held += n.appointments_held;
    totals.pipeline_additions += n.pipeline_additions;
    totals.contracts_signed += n.contracts_signed;
    totals.firm_deals += n.firm_deals;
    totals.doors_knocked += n.doors_knocked;
    totals.database_size = Math.max(totals.database_size, n.database_size);
  }

  return totals;
}
