import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Public webhook receiver for Slack Events API.
// Configure the Slack app's Event Subscriptions Request URL to this function
// and subscribe to "message.channels" (and "message.groups" for private channels).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }

  // Slack URL verification handshake
  if (body?.type === 'url_verification') {
    return new Response(body.challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Acknowledge quickly; process inline (fast enough).
  if (body?.type === 'event_callback' && body.event) {
    const event = body.event;

    // Only handle plain messages, ignore bot echoes, edits, deletes, threads-broadcast noise.
    const isMessage = event.type === 'message';
    const isBot = !!event.bot_id || event.subtype === 'bot_message';
    const isEdit = event.subtype === 'message_changed' || event.subtype === 'message_deleted';
    if (!isMessage || isBot || isEdit) {
      return new Response('ok');
    }

    const channelId = event.channel as string | undefined;
    const text = (event.text as string | undefined) ?? '';
    const ts = event.ts as string | undefined;
    if (!channelId || !text.trim() || !ts) return new Response('ok');

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Find the portal linked to this channel
    const { data: portal } = await admin
      .from('client_accounts')
      .select('id')
      .eq('slack_channel_id', channelId)
      .maybeSingle();
    if (!portal) return new Response('ok');

    // Avoid duplicates for messages we posted ourselves (agent/client relays).
    const { data: existing } = await admin
      .from('portal_messages')
      .select('id')
      .eq('portal_id', portal.id)
      .eq('slack_ts', ts)
      .maybeSingle();
    if (existing) return new Response('ok');

    await admin.from('portal_messages').insert({
      portal_id: portal.id,
      sender_type: 'ops',
      sender_name: 'Luxe Realty Support',
      message_body: text,
      slack_ts: ts,
    });
  }

  return new Response('ok');
});