import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { getInstanceSecret } from '../_shared/instanceSecrets.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    let userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const portalId = String(body.portal_id ?? '').trim();
    const message = String(body.message ?? '').trim();
    const sendAsAgentId = body.send_as_agent_id ? String(body.send_as_agent_id).trim() : '';
    const wantsInternal = body.is_internal === true;
    const attachmentId = body.attachment_document_id ? String(body.attachment_document_id).trim() : '';
    if (!portalId || (!message && !attachmentId)) {
      return json({ error: 'portal_id and message required' }, 400);
    }
    if (message.length > 4000) return json({ error: 'Message too long' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Load portal + determine sender role
    const { data: portal, error: portalErr } = await admin
      .from('client_accounts')
      .select('id, user_id, full_name, slack_channel_id')
      .eq('id', portalId)
      .maybeSingle();
    if (portalErr || !portal) return json({ error: 'Portal not found' }, 404);

    const isClient = portal.user_id === userId;
    let senderType: 'client' | 'agent' | 'ops' = 'client';
    let senderName = portal.full_name || 'Client';
    // Internal notes are team-only. A client can never create one, whatever the
    // request body says — this is decided here, on the server.
    let isInternal = false;

    if (!isClient) {
      // Must be a team member (agent/admin/owner/operations)
      const { data: teamCheck } = await admin.rpc('is_team_member', { _user_id: userId });
      if (!teamCheck) return json({ error: 'Forbidden' }, 403);
      senderType = 'agent';
      isInternal = wantsInternal;

      // If an admin/owner is impersonating an agent via "View as Agent",
      // attribute the message to that agent instead of the real user.
      let attributedUserId = userId;
      if (sendAsAgentId && sendAsAgentId !== userId) {
        const [{ data: isAdmin }, { data: isOwner }] = await Promise.all([
          admin.rpc('has_role', { _user_id: userId, _role: 'admin' }),
          admin.rpc('has_role', { _user_id: userId, _role: 'owner' }),
        ]);
        if (isAdmin || isOwner) {
          attributedUserId = sendAsAgentId;
        }
      }

      // Operations replies are labelled as Operations so the client sees a team,
      // not a single person.
      const { data: isOps } = await admin.rpc('has_role', {
        _user_id: attributedUserId,
        _role: 'operations',
      });
      if (isOps) senderType = 'ops';

      const { data: prof } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', attributedUserId)
        .maybeSingle();
      senderName = prof?.full_name || (senderType === 'ops' ? 'Operations' : 'Your Agent');
      // Reassign so the DB row + downstream notification trigger reflect the agent.
      userId = attributedUserId;
    }

    // Post to Slack first (so we can capture ts). If it fails, still save.
    let slackTs: string | null = null;
    const slackToken = await getInstanceSecret('SLACK_BOT_TOKEN');
    if (!slackToken && portal.slack_channel_id) {
      console.warn('Slack is not connected for this instance; portal message not mirrored to Slack.');
    }
    // Internal notes stay inside LUXEhub — they are never mirrored to Slack.
    if (slackToken && portal.slack_channel_id && !isInternal) {
      try {
        const emoji = senderType === 'client' ? '💬' : '🧑‍💼';
        const text = `${emoji} *${senderName}*: ${message}`;
        const resp = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${slackToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({ channel: portal.slack_channel_id, text }),
        });
        const data = await resp.json();
        if (data?.ok) slackTs = data.ts as string;
        else {
          // Visible failure: most often the linked channel is from a different
          // Slack workspace than this instance's bot token, or the bot is not
          // in the channel. The message is still saved to the portal.
          console.error(
            'Slack post failed for channel', portal.slack_channel_id,
            '-', data?.error,
            data?.error === 'channel_not_found'
              ? '(channel does not exist in this instance\'s Slack workspace — re-link it)'
              : data?.error === 'not_in_channel'
                ? '(invite the bot to the channel)'
                : '',
          );
        }
      } catch (e) {
        console.error('Slack post error:', e);
      }
    }

    const { data: inserted, error: insErr } = await admin
      .from('portal_messages')
      .insert({
        portal_id: portalId,
        sender_type: senderType,
        sender_name: senderName,
        sender_user_id: userId,
        message_body: message,
        slack_ts: slackTs,
        is_internal: isInternal,
        attachment_document_id: attachmentId || null,
      })
      .select()
      .single();
    if (insErr) {
      console.error('Insert failed:', insErr);
      return json({ error: 'Failed to save message' }, 500);
    }

    return json({ ok: true, message: inserted });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}