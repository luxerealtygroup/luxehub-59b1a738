/**
 * Single source of truth for brokerage-specific values inside edge functions.
 *
 * Every value is read from an environment variable and falls back to the
 * current LUXE Realty Group value, so the original instance is unaffected.
 * A clone sets these as project secrets — no code edit required.
 */

const pick = (key: string, fallback: string): string => {
  const v = Deno.env.get(key);
  return v && v.trim().length > 0 ? v.trim() : fallback;
};

export const tenant = {
  /** Product name (app chrome, Slack alerts, email display name). */
  appName: pick('TENANT_APP_NAME', 'LUXEhub'),
  /** Short mark. */
  shortName: pick('TENANT_SHORT_NAME', 'LUXE'),
  /** Brokerage name shown to clients in emails. */
  brokerageName: pick('TENANT_BROKERAGE_NAME', 'LUXE Realty Group'),
  /** Canonical client-facing base URL — all emailed links build from this. */
  appUrl: pick('TENANT_APP_URL', 'https://luxerealtyhub.com').replace(/\/+$/, ''),
  /** Verified sending subdomain delegated for email (envelope domain). */
  senderDomain: pick('SENDER_DOMAIN', 'notify.luxerealtygroup.ca'),
  /** Domain shown in the From: header. */
  fromDomain: pick('FROM_DOMAIN', 'luxerealtygroup.ca'),
  /** Local part of the From: address. */
  fromLocalPart: pick('FROM_LOCAL_PART', 'noreply'),
  /** Display name in the From: header. */
  fromName: pick('FROM_NAME', 'luxehub'),
  /** Support / reply-to address. */
  supportEmail: pick('TENANT_SUPPORT_EMAIL', 'info@luxerealtygroup.ca'),
} as const;

/** Fully-formed From: header value. */
export const fromAddress = `${tenant.fromName} <${tenant.fromLocalPart}@${tenant.fromDomain}>`;
