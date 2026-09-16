/**
 * Helpers for turning whatever an agent typed into a real hub address.
 *
 * A setup request asks for a "desired domain" and people type anything:
 * "Robertorealestate", "https://Roberto.luxerealtyhub.com/", "roberto ".
 * Every tenant hub lives at <label>.luxerealtyhub.com, so we reduce the
 * input to its label and build the full URL ourselves.
 */

export const HUB_ROOT_DOMAIN = 'luxerealtyhub.com';

/** Reduce any user input to a bare subdomain label, or '' if nothing usable. */
export const toHubLabel = (input: string | null | undefined): string => {
  if (!input) return '';
  let v = String(input).trim().toLowerCase();
  v = v.replace(/^[a-z]+:\/\//, ''); // protocol
  v = v.split('/')[0]; // path
  v = v.split('?')[0].split('#')[0];
  v = v.replace(/\.+$/, ''); // trailing dots
  v = v.replace(new RegExp(`\\.?${HUB_ROOT_DOMAIN.replace('.', '\\.')}$`), '');
  v = v.replace(/\s+/g, '');
  v = v.split('.')[0]; // keep the first label only
  v = v.replace(/[^a-z0-9-]/g, '');
  v = v.replace(/^-+|-+$/g, '');
  return v.slice(0, 63);
};

/** Full hub URL, or '' when no usable label was given. */
export const toHubUrl = (input: string | null | undefined): string => {
  const label = toHubLabel(input);
  return label ? `https://${label}.${HUB_ROOT_DOMAIN}` : '';
};

/** Lowercase the host and add https:// when the agent left it off. */
export const normalizeWebsiteUrl = (input: string | null | undefined): string => {
  if (!input) return '';
  const raw = String(input).trim();
  if (!raw) return '';
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    url.protocol = 'https:';
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, '');
  } catch {
    return `https://${raw.toLowerCase().replace(/^[a-z]+:\/\//, '')}`;
  }
};

/** True when the typed label is already in the allowed character set. */
export const isValidHubLabel = (input: string): boolean =>
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(input);
