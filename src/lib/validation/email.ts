// Shared, deliberately strict-enough email check: rejects junk like "rt" or
// "a@b" while staying permissive about real-world addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function isValidEmail(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  return v.length <= 254 && EMAIL_RE.test(v);
}
