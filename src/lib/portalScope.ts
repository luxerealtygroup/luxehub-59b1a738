/**
 * Property scoping for client-portal content.
 *
 * A portal can now hold several properties. Documents, photos, tasks and
 * timeline notes may either belong to one property or stay portal-wide
 * ("General", property_id = NULL). Every row that existed before the
 * multi-property migration is portal-wide, so nothing disappears.
 */
export type PortalScope = 'all' | 'general' | (string & {});

export const ALL_SCOPE: PortalScope = 'all';
export const GENERAL_SCOPE: PortalScope = 'general';

/** True when a row with this property_id should be visible under `scope`. */
export function matchesScope(rowPropertyId: string | null | undefined, scope: PortalScope = 'all') {
  if (scope === 'all') return true;
  if (scope === 'general') return !rowPropertyId;
  return rowPropertyId === scope;
}

/** The property_id newly created content should carry for the current scope. */
export function scopePropertyId(scope: PortalScope = 'all'): string | null {
  return scope === 'all' || scope === 'general' ? null : scope;
}
