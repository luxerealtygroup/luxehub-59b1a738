/**
 * Tenant isolation test — runs on every build (`npm run test:isolation`,
 * wired into `npm run build`).
 *
 * It calls the `isolation-check` edge function, which signs in as a FIXTURE
 * account in a throwaway org whose display name ("Kristen Schulz") and profile
 * email ("info@luxerealtygroup.ca") deliberately COLLIDE with real Luxe
 * records. Any query that scopes by identity instead of org_id will therefore
 * return rows — and this test fails the build.
 *
 * The function also runs a positive control: the same by-id lookups executed
 * with RLS bypassed MUST return the row, so a passing run cannot pass
 * vacuously (empty tables, wrong ids, silent errors).
 */
import { describe, it, expect } from 'vitest';

const PROJECT_ID = process.env.VITE_SUPABASE_PROJECT_ID ?? 'sxpfxmlxegpmfamlmjyg';
const TOKEN = process.env.ISOLATION_TEST_TOKEN;

interface Result {
  counts: Record<string, number>;
  foreignProfiles: number;
  byId: Record<string, number>;
  controls: Record<string, number>;
  storage: Record<string, string>;
  storageControls: Record<string, string>;
  realtime: Record<string, string>;
  leaks: string[];
  vacuous: string[];
  pass: boolean;
}


describe('tenant isolation (identity-colliding fixture)', () => {
  it('exposes zero Luxe rows to an outside-org account', async () => {
    if (!TOKEN) throw new Error('ISOLATION_TEST_TOKEN is not set — cannot verify tenant isolation');

    const res = await fetch(`https://${PROJECT_ID}.supabase.co/functions/v1/isolation-check`, {
      method: 'POST',
      headers: { 'x-isolation-token': TOKEN, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const r = (await res.json()) as Result;

    // Every allowlisted table must be empty for the fixture account.
    for (const [table, count] of Object.entries(r.counts)) {
      expect(count, `${table} leaked ${count} rows to another org`).toBe(0);
    }
    // Only its own profile is visible.
    expect(r.foreignProfiles, 'profiles of other orgs are visible').toBe(0);
    // Direct-by-id reads of known Luxe records are denied.
    for (const [table, count] of Object.entries(r.byId)) {
      expect(count, `${table} readable by direct id from another org`).toBe(0);
    }
    // Positive control: the same lookups DO return rows without RLS.
    for (const [table, count] of Object.entries(r.controls)) {
      expect(count, `positive control failed for ${table} — test would pass vacuously`)
        .toBeGreaterThan(0);
    }

    // Storage: no listing, download, upload or delete of another org's portal files.
    for (const [check, value] of Object.entries(r.storage)) {
      if (check.endsWith(':list')) {
        expect(Number(value), `${check} exposed another org's portal objects`).toBe(0);
      } else {
        expect(value, `${check} succeeded against another org's portal files`)
          .toMatch(/^denied/);
      }
    }
    // Positive control: the probe object really existed and was reachable without RLS.
    for (const [check, value] of Object.entries(r.storageControls)) {
      if (check.endsWith(':seed')) {
        expect(value, `storage probe could not be seeded (${check})`).toBe('ok');
      } else {
        expect(Number(value), `storage positive control failed for ${check}`).toBeGreaterThan(0);
      }
    }

    // Realtime: another org's private topics are unreachable, own org's is not.
    expect(r.realtime.foreign_portal_topic ?? 'blocked', 'joined another org portal topic')
      .toBe('blocked');
    expect(r.realtime.foreign_org_topic, 'joined another org realtime topic').toBe('blocked');
    expect(r.realtime.own_org_topic, 'realtime positive control failed — test would pass vacuously')
      .toBe('joined');

    expect(r.leaks).toEqual([]);
    expect(r.vacuous).toEqual([]);
    expect(r.pass).toBe(true);
  }, 120_000);
});
