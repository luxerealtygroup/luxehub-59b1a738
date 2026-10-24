import { describe, expect, it } from 'vitest';
import { canDisableTeamAccount } from '../supabase/functions/disable-team-account/policy';

describe('team account lockout authorization', () => {
  it('permits an owner to disable their own brokerage agent', () => {
    expect(canDisableTeamAccount('owner', 'luxe', 'terra', 'luxe', ['owner'], ['agent'])).toBe(true);
  });
  it('rejects another brokerage', () => {
    expect(canDisableTeamAccount('owner', 'luxe', 'terra', 'other', ['owner'], ['agent'])).toBe(false);
  });
  it('rejects non-owner callers', () => {
    expect(canDisableTeamAccount('agent', 'luxe', 'terra', 'luxe', ['agent'], ['agent'])).toBe(false);
  });
  it('rejects self-disable and protected owner accounts', () => {
    expect(canDisableTeamAccount('owner', 'luxe', 'owner', 'luxe', ['owner'], ['agent'])).toBe(false);
    expect(canDisableTeamAccount('owner', 'luxe', 'other-owner', 'luxe', ['owner'], ['agent', 'owner'])).toBe(false);
  });
});