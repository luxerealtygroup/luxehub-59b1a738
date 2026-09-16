// Sends the welcome email to a new team owner, from Admin -> Setup Requests.
//
// Never sends automatically: the admin confirms in the UI first. The email
// carries the hub address and a live activation link (never a password); a
// fresh invite is minted when the pending one has expired or been used.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireStaff } from '../_shared/auth.ts';

const HUB_ROOT_DOMAIN = 'luxerealtyhub.com';
const SENDER_ORG_NAME = 'Luxe Realty Group';
const SENDER_EMAIL = 'info@luxerealtygroup.ca';

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

  let requestId: string | undefined;
  try {
    requestId = (await req.json())?.requestId;
  } catch {
    /* handled below */
  }
  if (!requestId || typeof requestId !== 'string') {
    return json({ error: 'requestId is required' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: request, error: reqErr } = await admin
    .from('onboarding_requests')
    .select('id, contact_name, email, business_name, org_id')
    .eq('id', requestId)
    .maybeSingle();
  if (reqErr) return json({ error: reqErr.message }, 500);
  if (!request) return json({ error: 'Setup request not found' }, 404);
  if (!request.org_id) return json({ error: 'This request has no team account yet' }, 400);

  const { data: org } = await admin
    .from('organizations')
    .select('id, name, slug')
    .eq('id', request.org_id)
    .maybeSingle();
  if (!org) return json({ error: 'Team account not found' }, 404);

  // Newest owner invite for this team that has not been used or revoked.
  const { data: invites } = await admin
    .from('org_invites')
    .select('id, email, full_name, token, expires_at, used_at, revoked_at')
    .eq('org_id', org.id)
    .eq('role', 'owner')
    .is('used_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  let invite = (invites ?? [])[0] ?? null;
  const recipient = (invite?.email || request.email || '').toLowerCase().trim();
  if (!recipient) return json({ error: 'No owner email on file' }, 400);

  // Expired (or missing) — mint a fresh 30-day link rather than mail a dead one.
  if (!invite || new Date(invite.expires_at).getTime() <= Date.now()) {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: fresh, error: insErr } = await admin
      .from('org_invites')
      .insert({
        org_id: org.id,
        email: recipient,
        role: 'owner',
        full_name: invite?.full_name ?? request.contact_name ?? null,
        token,
        expires_at: expiresAt,
        invited_by: guard.caller.userId,
      })
      .select('id, email, full_name, token, expires_at')
      .single();
    if (insErr) return json({ error: insErr.message }, 500);
    invite = fresh as typeof invite;
  }

  const hubUrl = `https://${org.slug}.${HUB_ROOT_DOMAIN}`;
  const activationUrl = `${hubUrl}/join?token=${encodeURIComponent(invite!.token)}`;
  const firstName = (invite!.full_name || request.contact_name || '').split(' ')[0] || '';
  const expiresOn = new Date(invite!.expires_at).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const { error: mailErr } = await admin.functions.invoke('send-transactional-email', {
    body: {
      templateName: 'tenant-owner-welcome',
      recipientEmail: recipient,
      idempotencyKey: `owner-welcome-${org.id}-${invite!.token.slice(0, 12)}`,
      templateData: {
        ownerName: firstName,
        teamName: org.name,
        hubUrl,
        hubHost: `${org.slug}.${HUB_ROOT_DOMAIN}`,
        activationUrl,
        expiresOn,
        senderOrgName: SENDER_ORG_NAME,
        senderEmail: SENDER_EMAIL,
      },
    },
  });
  if (mailErr) return json({ error: mailErr.message }, 502);

  const sentAt = new Date().toISOString();
  await admin
    .from('onboarding_requests')
    .update({ welcome_email_sent_at: sentAt })
    .eq('id', request.id);

  return json({ ok: true, recipient, hubUrl, sentAt });
});
