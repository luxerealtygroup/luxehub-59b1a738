/**
 * Public "request access" endpoint for client portals.
 *
 * A client enters their email on /client-portal/request-access. If that address
 * belongs to a portal we either email a fresh single-use invite (no account
 * yet) or a sign-in link (account exists). The response is ALWAYS identical, so
 * the endpoint never reveals whether an address is on file.
 *
 * Rate limited per email address.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { tenant } from '../_shared/tenant.ts';

const MAX_PER_HOUR = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

async function sendEmail(templateName: string, to: string, data: Record<string, unknown>) {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-email`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateName,
      recipientEmail: to,
      idempotencyKey: `${templateName}-${to}-${Date.now()}`,
      templateData: data,
    }),
  });
  if (!res.ok) console.error(`portal-request-access: email failed [${res.status}]`, await res.text());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // One answer for every outcome.
  const ok = () =>
    new Response(
      JSON.stringify({
        ok: true,
        message:
          'If that email address is on a client portal, we have just sent a link to it. Please check your inbox, including spam.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  let email = '';
  try {
    const body = await req.json();
    email = String(body?.email ?? '').trim().toLowerCase();
  } catch {
    return ok();
  }
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return ok();

  const db = admin();

  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from('portal_access_requests')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', since);
    if ((count ?? 0) >= MAX_PER_HOUR) {
      await db.from('portal_access_requests').insert({ email, outcome: 'rate_limited' });
      return ok();
    }

    const { data: portal } = await db
      .from('client_accounts')
      .select('id,user_id,full_name,invited_by')
      .eq('email', email)
      .maybeSingle();

    if (!portal) {
      await db.from('portal_access_requests').insert({ email, outcome: 'no_match' });
      return ok();
    }

    if (!portal.user_id) {
      // No account yet — mint a fresh single-use invite, same as the agent flow.
      const token =
        crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      await db
        .from('client_accounts')
        .update({
          invite_token: token,
          invite_expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          invite_used_at: null,
          invited_at: new Date().toISOString(),
        })
        .eq('id', portal.id);

      let agentName = 'Your agent';
      if (portal.invited_by) {
        const { data: agent } = await db
          .from('profiles')
          .select('full_name')
          .eq('id', portal.invited_by)
          .maybeSingle();
        if (agent?.full_name) agentName = agent.full_name;
      }

      await sendEmail('client-portal-invite', email, {
        clientName: portal.full_name || '',
        agentName,
        inviteUrl: `${tenant.appUrl}/client-portal/signup?token=${encodeURIComponent(token)}`,
      });
      await db.from('portal_access_requests').insert({ email, outcome: 'invite_sent' });
      return ok();
    }

    // Existing account — send a one-time sign-in link.
    const { data: link, error } = await db.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${tenant.appUrl}/client-portal` },
    });
    if (error || !link?.properties?.action_link) {
      console.error('portal-request-access: magic link failed', error?.message);
      await db.from('portal_access_requests').insert({ email, outcome: 'signin_failed' });
      return ok();
    }

    await sendEmail('client-portal-signin', email, {
      clientName: portal.full_name || '',
      signInUrl: link.properties.action_link,
    });
    await db.from('portal_access_requests').insert({ email, outcome: 'signin_sent' });
    return ok();
  } catch (err) {
    console.error('portal-request-access error:', (err as Error).message);
    return ok();
  }
});
