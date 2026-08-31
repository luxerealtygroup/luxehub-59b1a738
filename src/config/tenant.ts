/**
 * Single source of truth for every brokerage-specific value in the frontend.
 *
 * Cloning this app for another brokerage must be a config change, not a code
 * edit: set the VITE_* variables below in the clone's environment. Every value
 * falls back to the current LUXE Realty Group value, so nothing changes for the
 * original instance if no env vars are set.
 */

const env = import.meta.env as Record<string, string | undefined>;

const pick = (key: string, fallback: string): string => {
  const v = env[key];
  return v && v.trim().length > 0 ? v.trim() : fallback;
};

export const tenant = {
  /** Product name shown in the app chrome, page titles and support UI. */
  appName: pick('VITE_TENANT_APP_NAME', 'LUXEhub'),
  /** Short mark used in compact/eyebrow spots. */
  shortName: pick('VITE_TENANT_SHORT_NAME', 'LUXE'),
  /** Legal/marketing brokerage name shown to clients. */
  brokerageName: pick('VITE_TENANT_BROKERAGE_NAME', 'Luxe Realty Group'),
  /** Full legal entity, used in policy/consent copy. */
  brokerageLegalName: pick('VITE_TENANT_BROKERAGE_LEGAL_NAME', 'Luxe Realty Group Inc.'),
  /** Line under an agent's name on client-facing reports. */
  brokerageDisclosure: pick(
    'VITE_TENANT_BROKERAGE_DISCLOSURE',
    'Brokered by eXp Realty, Brokerage',
  ),
  /** Public marketing website domain (shown, not linked). */
  websiteDomain: pick('VITE_TENANT_WEBSITE_DOMAIN', 'luxerealtygroup.ca'),
  /** Where clients and agents email for help. */
  supportEmail: pick('VITE_TENANT_SUPPORT_EMAIL', 'info@luxerealtygroup.ca'),
  /** Canonical client-facing base URL — every emailed link is built from this. */
  canonicalAppUrl: pick('VITE_TENANT_APP_URL', 'https://luxerealtyhub.com').replace(/\/+$/, ''),
  /** Hosts where window.location.origin may be reused instead of the canonical URL. */
  productionHosts: pick(
    'VITE_TENANT_PRODUCTION_HOSTS',
    'luxerealtyhub.com,www.luxerealtyhub.com,luxehub.lovable.app',
  )
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
  /** Prefix for browser storage keys so two clones on one machine don't collide. */
  storagePrefix: pick('VITE_TENANT_STORAGE_PREFIX', 'luxehub'),
} as const;

/** Label for the in-app support persona, e.g. "LUXE Support". */
export const supportBrand = `${tenant.shortName} Support`;
