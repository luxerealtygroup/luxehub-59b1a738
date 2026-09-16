// Owner invitations for teams that already exist.
//
// Platform-owner only. Two actions:
//   status -> owner state for every team (active owner, pending, expired, none)
//   send   -> revoke any live owner invite for that team, mint a fresh one and
//             email it. Nothing is sent unless the caller asks for it.
//
// An owner invite only ever makes someone the owner of the named team; it never
// adds them to the original organization.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireStaff } from '../_shared/auth.ts';

const HUB_ROOT_DOMAIN = 'luxerealtyhub.com';
const SENDER_ORG_NAME = 'Luxe Realty Group';
const SENDER_EMAIL = 'info@luxerealtygroup.ca';
const INVITE_DAYS = 30;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const randomToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const guard = await requireStaff(req, { adminOnly: true, cors: corsHeaders });
  if (!guard.ok) return guard.response;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  if (guard.caller.kind !== 'service') {
    const { data: superAdmin } = await admin.rpc('is_super_admin', {
      _user_id: guard.caller.userId,
    });
    if (superAdmin !== true) return json({ error: 'FORBIDDEN' }, 403);
  }

  let body: { action?: string; orgId?: string; email?: string; fullName?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* validated below */
  }
  const action = body.action ?? 'status';

  if (action === 'status') {
    const { data: orgs } = await admin.from('organizations').select('id, name, slug');
    const { data: invites } = await admin
      .from('org_invites')
      .select('id, org_id, email, full_name, expires_at, used_at, revoked_at, created_at')
      .eq('role', 'owner')
      .order('created_at', { ascending: false });
    const { data: ownerRoles } = await admin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'owner');
    const ownerIds = (ownerRoles ?? []).map((r) => r.user_id);
    const { data: ownerProfiles } = ownerIds.length
      ? await admin.from('profiles').select('id, org_id, full_name, email').in('id', ownerIds)
      : { data: [] as Array<Record<string, unknown>> };

    const now = Date.now();
    const result = (orgs ?? []).map((o) => {
      const active = (ownerProfiles ?? []).find((p) => p.org_id === o.id);
      const invite = (invites ?? []).find((i) => i.org_id === o.id && !i.revoked_at);
      let state: 'active' | 'invited' | 'expired' | 'none' = 'none';
      if (active) state = 'active';
      else if (invite && !invite.used_at) {
        state = new Date(invite.expires_at).getTime() > now ? 'invited' : 'expired';
      } else if (invite?.used_at) state = 'active';

      return {
        orgId: o.id,
        orgName: o.name,
        hubHost: o.slug ? `${o.slug}.${HUB_ROOT_DOMAIN}` : null,
        state,
        ownerName: (active?.full_name as string) ?? invite?.full_name ?? null,
        ownerEmail: (active?.email as string) ?? invite?.email ?? null,
        invitedAt: invite?.created_at ?? null,
        expiresAt: invite?.expires_at ?? null,
      };
    });
    return json({ ok: true, teams: result });
  }

  if (action !== 'send') return json({ error: 'Unknown action' }, 400);

  const orgId = body.orgId;
  if (!orgId) return json({ error: 'orgId is required' }, 400);

  const { data: org } = await admin
    .from('organizations')
    .select('id, name, slug, is_original_org')
    .eq('id', orgId)
    .maybeSingle();
  if (!org) return json({ error: 'Team not found' }, 404);

  const { data: existing } = await admin
    .from('org_invites')
    .select('id, email, full_name')
    .eq('org_id', orgId)
    .eq('role', 'owner')
    .is('used_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  const email = (body.email || existing?.[0]?.email || '').toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'A valid owner email is required' }, 400);
  }
  const fullName = (body.fullName || existing?.[0]?.full_name || '').trim() || null;

  // One live invitation per team: supersede anything still outstanding.
  if (existing?.length) {
    await admin
      .from('org_invites')
      .update({ revoked_at: new Date().toISOString() })
      .in('id', existing.map((i) => i.id));
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86400000).toISOString();
  const { error: insErr } = await admin.from('org_invites').insert({
    org_id: orgId,
    email,
    role: 'owner',
    full_name: fullName,
    token,
    expires_at: expiresAt,
    invited_by: guard.caller.userId,
  });
  if (insErr) return json({ error: insErr.message }, 500);

  const hubHost = org.slug ? `${org.slug}.${HUB_ROOT_DOMAIN}` : HUB_ROOT_DOMAIN;
  const inviteUrl = `https://${hubHost}/join?token=${encodeURIComponent(token)}`;

  const { error: mailErr } = await admin.functions.invoke('send-transactional-email', {
    body: {
      templateName: 'team-owner-invite',
      recipientEmail: email,
      idempotencyKey: `owner-invite-${orgId}-${token.slice(0, 12)}`,
      templateData: {
        ownerName: (fullName || '').split(' ')[0] || '',
        teamName: org.name,
        hubHost,
        inviteUrl,
        expiresOn: new Date(expiresAt).toLocaleDateString('en-CA', {
          year: 'numeric', month: 'long', day: 'numeric',
        }),
        senderOrgName: SENDER_ORG_NAME,
        senderEmail: SENDER_EMAIL,
      },
    },
  });
  if (mailErr) return json({ error: mailErr.message }, 502);

  return json({ ok: true, email, hubHost, inviteUrl, expiresAt });
});
