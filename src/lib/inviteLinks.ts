import { supabase } from '@/integrations/supabase/client';

/**
 * Canonical, client-facing base URL.
 *
 * Any link that can end up in a client's inbox MUST be built from this, never
 * from window.location.origin — an agent working inside the Lovable preview or
 * on localhost would otherwise mail an unreachable link to a real client.
 */
export const CANONICAL_APP_URL = 'https://luxerealtyhub.com';

/** Hosts where window.location.origin is safe to reuse (real published app). */
const PRODUCTION_HOSTS = new Set([
  'luxerealtyhub.com',
  'www.luxerealtyhub.com',
  'luxehub.lovable.app',
]);

/**
 * Base URL for links we hand to clients. On a production host we mirror the
 * current origin (so www vs apex stays consistent); anywhere else — preview,
 * localhost, custom staging — we fall back to the canonical domain.
 */
export function clientFacingBaseUrl(): string {
  if (typeof window === 'undefined') return CANONICAL_APP_URL;
  return PRODUCTION_HOSTS.has(window.location.hostname)
    ? window.location.origin
    : CANONICAL_APP_URL;
}

export function buildInviteUrl(token: string): string {
  return `${clientFacingBaseUrl()}/client-portal/signup?token=${encodeURIComponent(token)}`;
}

export interface PortalInvite {
  token: string;
  expiresAt: string;
  url: string;
}

/**
 * Mint a fresh single-use, 7-day invite token for a portal. Any previously
 * issued token for that portal is replaced.
 */
export async function createPortalInvite(portalId: string): Promise<PortalInvite> {
  const { data, error } = await supabase.rpc('create_portal_invite', { _portal_id: portalId });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  const token = (row as { token?: string } | null)?.token;
  const expiresAt = (row as { expires_at?: string } | null)?.expires_at ?? '';
  if (!token) throw new Error('Could not generate an invitation link');

  return { token, expiresAt, url: buildInviteUrl(token) };
}

interface SendInviteArgs {
  portalId: string;
  email: string;
  clientName?: string | null;
  agentName?: string | null;
}

/**
 * Mint a token and email the invitation. Returns the invite so callers can show
 * or copy the exact link that was sent.
 */
export async function sendPortalInvite({
  portalId,
  email,
  clientName,
  agentName,
}: SendInviteArgs): Promise<PortalInvite> {
  const invite = await createPortalInvite(portalId);

  const { error } = await supabase.functions.invoke('send-transactional-email', {
    body: {
      templateName: 'client-portal-invite',
      recipientEmail: email,
      idempotencyKey: `portal-invite-${portalId}-${invite.token.slice(0, 12)}`,
      templateData: {
        clientName: clientName || '',
        agentName: agentName || 'Your agent',
        inviteUrl: invite.url,
      },
    },
  });
  if (error) throw new Error(error.message);

  return invite;
}

/** Token stashed while the client verifies their email / signs in. */
const PENDING_TOKEN_KEY = 'luxe.portalInviteToken';

export function rememberPendingInvite(token: string) {
  try {
    localStorage.setItem(PENDING_TOKEN_KEY, token);
  } catch {
    /* storage unavailable — claiming just needs the link again */
  }
}

export function readPendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(PENDING_TOKEN_KEY);
  } catch {
    /* no-op */
  }
}

/**
 * Claim a portal for the currently signed-in user. Safe to call speculatively:
 * resolves to false when there is no pending token.
 */
export async function claimPendingInvite(fullName?: string | null): Promise<boolean> {
  const token = readPendingInvite();
  if (!token) return false;
  const { error } = await supabase.rpc('claim_portal_invite', {
    _token: token,
    _full_name: fullName ?? null,
  });
  clearPendingInvite();
  if (error) {
    console.error('Could not claim portal invite:', error.message);
    return false;
  }
  return true;
}
