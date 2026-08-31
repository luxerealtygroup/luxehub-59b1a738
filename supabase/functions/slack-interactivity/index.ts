// Slack interactivity endpoint.
//
// Handles exactly one thing: the "Send to client portal" message shortcut
// (callback_id `push_to_portal`). It never subscribes to message events, never
// listens passively, and never reads any message the agent did not explicitly
// select. Every inbound request must carry a valid Slack signature.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { tenant } from '../_shared/tenant.ts';
import { SLACK_API, getSlackToken, assertChannelInWorkspace, SlackConfigError } from '../_shared/slack.ts';


const SHORTCUT_CALLBACK_ID = 'push_to_portal';
const VIEW_CALLBACK_ID = 'push_to_portal_submit';

const CANONICAL_STAGES = [
  'Lead',
  'Active',
  'Under Contract',
  'Inspection',
  'Financing',
  'Closing',
  'Closed',
];

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

async function verifySlackSignature(req: Request, rawBody: string): Promise<string | null> {
  const secret = Deno.env.get('SLACK_SIGNING_SECRET');
  if (!secret) return 'SLACK_SIGNING_SECRET is not configured';

  const timestamp = req.headers.get('x-slack-request-timestamp');
  const signature = req.headers.get('x-slack-signature');
  if (!timestamp || !signature) return 'Missing Slack signature headers';

  // Replay window: 5 minutes.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return 'Stale request (outside replay window)';

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`v0:${timestamp}:${rawBody}`),
  );
  const expected = `v0=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;

  // Constant-time comparison.
  if (expected.length !== signature.length) return 'Invalid signature';
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0 ? null : 'Invalid signature';
}

// ---------------------------------------------------------------------------
// Slack helpers
// ---------------------------------------------------------------------------

// Token + workspace resolution lives in _shared/slack.ts so no code here
// assumes a particular Slack workspace.
const botToken = getSlackToken;

async function slackGet(method: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${SLACK_API}/${method}?${qs}`, {
    headers: { Authorization: `Bearer ${botToken()}` },
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'non_json_response' }));
  if (!data.ok) console.error(`slack ${method} failed:`, data.error, data.needed ?? '');
  return data;
}

async function slackPost(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken()}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'non_json_response' }));
  if (!data.ok) console.error(`slack ${method} failed:`, data.error, data.response_metadata ?? '');
  return data;
}

async function ephemeral(channel: string, user: string, text: string) {
  await slackPost('chat.postEphemeral', { channel, user, text });
}

// ---------------------------------------------------------------------------
// Slack markup stripping
// ---------------------------------------------------------------------------

async function resolveUserNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids)];
  await Promise.all(
    unique.map(async (id) => {
      const info = await slackGet('users.info', { user: id });
      if (info.ok) {
        const p = info.user?.profile ?? {};
        map.set(id, p.display_name || p.real_name || info.user?.real_name || info.user?.name || '');
      }
    }),
  );
  return map;
}

/**
 * Convert Slack message markup into plain prose safe for a client to read.
 * Mentions become display names (or are dropped), channel refs / group pings /
 * emoji shortcodes are removed, links collapse to their label.
 */
export function stripSlackArtifacts(input: string, userNames: Map<string, string>): string {
  let t = input ?? '';

  // User mentions -> display name, else drop entirely.
  t = t.replace(/<@([UW][A-Z0-9]+)(?:\|([^>]*))?>/g, (_m, id: string, label: string) => {
    const name = userNames.get(id) || label || '';
    return name ? name : '';
  });

  // Channel references, @here/@channel/@everyone, user-group pings -> removed.
  t = t.replace(/<#[CGD][A-Z0-9]+(?:\|[^>]*)?>/g, '');
  t = t.replace(/<!(?:here|channel|everyone)(?:\|[^>]*)?>/g, '');
  t = t.replace(/<!subteam\^[A-Z0-9]+(?:\|[^>]*)?>/g, '');
  t = t.replace(/<!date\^\d+\^([^>|]*)(?:\|([^>]*))?>/g, (_m, _tok, fallback) => fallback || '');

  // Links -> label, or bare URL.
  t = t.replace(/<mailto:[^>|]+\|([^>]+)>/g, '$1');
  t = t.replace(/<(https?:[^>|]+)\|([^>]+)>/g, '$2');
  t = t.replace(/<(https?:[^>]+)>/g, '$1');

  // Any other angle-bracket Slack token we did not recognise.
  t = t.replace(/<[!@#][^>]*>/g, '');

  // Emoji shortcodes.
  t = t.replace(/:[a-z0-9_+\-']+:/gi, '');

  // Code fences / inline code markers.
  t = t.replace(/```/g, '').replace(/`/g, '');

  // Slack bold / italic / strike markers -> plain prose.
  t = t.replace(/(^|[\s(])\*(\S[^*\n]*?)\*(?=[\s.,!?)]|$)/g, '$1$2');
  t = t.replace(/(^|[\s(])_(\S[^_\n]*?)_(?=[\s.,!?)]|$)/g, '$1$2');
  t = t.replace(/(^|[\s(])~(\S[^~\n]*?)~(?=[\s.,!?)]|$)/g, '$1$2');
  // Slack blockquote markers.
  t = t.replace(/^&gt;\s?/gm, '').replace(/^>\s?/gm, '');

  // HTML entities Slack escapes.
  t = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  // Tidy whitespace: collapse runs left behind by removed tokens.
  t = t
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\s+([.,!?;:])/g, '$1')
        .replace(/[ \t]+$/, '')
        .replace(/^[ \t]+/, ''),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return t;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function portalForChannel(channelId: string) {
  const { data } = await admin()
    .from('client_accounts')
    .select('id, full_name, email, slack_channel_id')
    .eq('slack_channel_id', channelId)
    .maybeSingle();
  return data;
}

/**
 * Map the acting Slack user to a team member. Publishing is refused
 * unless this resolves — it gives us a real audit identity and keeps anyone
 * who is not on the team from pushing content to a client.
 */
async function resolveTeamMember(slackUserId: string) {
  const info = await slackGet('users.info', { user: slackUserId });
  const email: string | undefined = info?.user?.profile?.email;
  if (!email) return { error: 'Could not read your Slack email. The app needs the users:read.email scope.' };

  const db = admin();
  const { data: profile } = await db
    .from('profiles')
    .select('id, full_name, email')
    .ilike('email', email)
    .maybeSingle();
  if (!profile) {
    return { error: `No ${tenant.appName} account matches your Slack email (${email}). Publishing is restricted to team members.` };
  }
  const { data: isTeam } = await db.rpc('is_team_member', { _user_id: profile.id });
  if (!isTeam) {
    return { error: `Your ${tenant.appName} account is not a team member, so it cannot publish to a client portal.` };
  }
  return { profile, email };
}

// ---------------------------------------------------------------------------
// Message fetching (explicit, one message, by ts)
// ---------------------------------------------------------------------------

async function fetchOneMessage(channel: string, ts: string) {
  const hist = await slackGet('conversations.history', {
    channel,
    latest: ts,
    inclusive: 'true',
    limit: '1',
  });
  let msg = hist.ok ? hist.messages?.[0] : null;
  if (msg?.ts !== ts) msg = null;

  if (!msg) {
    // The selected message may be a thread reply, which history does not return.
    const replies = await slackGet('conversations.replies', {
      channel,
      ts,
      inclusive: 'true',
      limit: '1',
    });
    if (replies.ok) msg = replies.messages?.find((m: any) => m.ts === ts) ?? null;
  }
  return msg;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function buildModal(opts: {
  portalName: string;
  cleanedText: string;
  properties: Array<{ id: string; address: string | null; role: string }>;
  stages: string[];
  hadAttachments: boolean;
  privateMetadata: string;
}) {
  const propertyOptions = [
    {
      text: { type: 'plain_text', text: 'General (not property-specific)' },
      value: 'none',
    },
    ...opts.properties.slice(0, 99).map((p) => ({
      text: {
        type: 'plain_text',
        text: `${p.address || 'Untitled property'} (${p.role})`.slice(0, 75),
      },
      value: p.id,
    })),
  ];

  const stageOptions = opts.stages.slice(0, 100).map((s) => ({
    text: { type: 'plain_text', text: s.slice(0, 75) },
    value: s.slice(0, 75),
  }));

  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Publishing to:* ${opts.portalName}\nReview the text carefully — this is what the client will see if you make it visible.`,
      },
    },
  ];

  if (opts.hadAttachments) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: ':paperclip: Files and attachments on the original message are *not* published — text only.',
        },
      ],
    });
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'input',
      block_id: 'text_block',
      label: { type: 'plain_text', text: 'Text to publish' },
      element: {
        type: 'plain_text_input',
        action_id: 'text',
        multiline: true,
        initial_value: opts.cleanedText.slice(0, 3000),
      },
    },
    {
      type: 'input',
      block_id: 'property_block',
      label: { type: 'plain_text', text: 'Property' },
      element: {
        type: 'static_select',
        action_id: 'property',
        initial_option: propertyOptions[0],
        options: propertyOptions,
      },
    },
    {
      type: 'input',
      block_id: 'destination_block',
      label: { type: 'plain_text', text: 'Destination' },
      element: {
        type: 'radio_buttons',
        action_id: 'destination',
        initial_option: {
          text: { type: 'plain_text', text: 'Portal message (chat)' },
          value: 'message',
        },
        options: [
          { text: { type: 'plain_text', text: 'Portal message (chat)' }, value: 'message' },
          { text: { type: 'plain_text', text: 'Timeline note' }, value: 'timeline' },
        ],
      },
    },
    {
      type: 'input',
      block_id: 'stage_block',
      optional: true,
      label: { type: 'plain_text', text: 'Timeline stage (timeline notes only)' },
      element: {
        type: 'static_select',
        action_id: 'stage',
        initial_option: stageOptions[0],
        options: stageOptions,
      },
    },
    {
      type: 'input',
      block_id: 'visibility_block',
      optional: true,
      label: { type: 'plain_text', text: 'Client visibility' },
      element: {
        type: 'checkboxes',
        action_id: 'visible',
        // No initial_option: defaults to OFF -> lands as is_internal = true.
        options: [
          {
            text: { type: 'plain_text', text: 'Visible to client' },
            description: {
              type: 'plain_text',
              text: 'Leave unchecked to publish as internal (agent-only).',
            },
            value: 'visible',
          },
        ],
      },
    },
  );

  return {
    type: 'modal',
    callback_id: VIEW_CALLBACK_ID,
    title: { type: 'plain_text', text: 'Send to portal' },
    submit: { type: 'plain_text', text: 'Publish' },
    close: { type: 'plain_text', text: 'Cancel' },
    private_metadata: opts.privateMetadata,
    blocks,
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleShortcut(payload: any) {
  const channelId = payload.channel?.id as string;
  const slackUserId = payload.user?.id as string;
  const ts = payload.message_ts as string;

  // Fail visibly if this instance's token can't actually reach the channel —
  // most often a channel linked from a different Slack workspace.
  const channelCheck = await assertChannelInWorkspace(channelId);
  if (!channelCheck.ok) {
    console.error('slack-interactivity channel check failed:', channelCheck.error);
    try {
      await ephemeral(channelId, slackUserId, `:warning: ${channelCheck.error}`);
    } catch (_) { /* ephemeral itself needs the token; nothing more we can do */ }
    return new Response('', { status: 200 });
  }

  const portal = await portalForChannel(channelId);
  if (!portal) {
    await ephemeral(
      channelId,
      slackUserId,
      `:no_entry: This channel is not linked to a client portal, so there is nothing to publish to. Link it in ${tenant.appName} under Client Portals → Manage → Setup, then try again.`,
    );
    return;
  }

  const member = await resolveTeamMember(slackUserId);
  if ('error' in member) {
    await ephemeral(channelId, slackUserId, `:no_entry: ${member.error}`);
    return;
  }

  const msg = await fetchOneMessage(channelId, ts);
  if (!msg) {
    await ephemeral(
      channelId,
      slackUserId,
      ':warning: Could not read that message. The app may be missing the channels:history / groups:history scope.',
    );
    return;
  }

  const mentionIds = [...String(msg.text ?? '').matchAll(/<@([UW][A-Z0-9]+)/g)].map((m) => m[1]);
  const names = await resolveUserNames(mentionIds);
  const cleaned = stripSlackArtifacts(String(msg.text ?? ''), names);

  if (!cleaned) {
    await ephemeral(
      channelId,
      slackUserId,
      ':warning: That message has no publishable text once Slack formatting and attachments are removed.',
    );
    return;
  }

  const db = admin();
  const [{ data: properties }, { data: noteStages }] = await Promise.all([
    db
      .from('portal_properties')
      .select('id, address, role, display_order')
      .eq('portal_id', portal.id)
      .order('display_order', { ascending: true }),
    db
      .from('portal_timeline_notes')
      .select('stage')
      .eq('client_account_id', portal.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  // Stages already in use on this portal are known to render; canonical stages
  // are offered as a fallback.
  const used = [...new Set((noteStages ?? []).map((n: any) => n.stage).filter(Boolean))];
  const stages = [...used, ...CANONICAL_STAGES.filter((s) => !used.includes(s))];

  const hadAttachments =
    Array.isArray(msg.files) && msg.files.length > 0 ||
    Array.isArray(msg.attachments) && msg.attachments.length > 0;

  await slackPost('views.open', {
    trigger_id: payload.trigger_id,
    view: buildModal({
      portalName: portal.full_name || portal.email,
      cleanedText: cleaned,
      properties: (properties ?? []) as any,
      stages,
      hadAttachments,
      privateMetadata: JSON.stringify({
        portal_id: portal.id,
        channel_id: channelId,
        ts,
        thread_ts: msg.thread_ts ?? ts,
        slack_user_id: slackUserId,
      }),
    }),
  });
}

async function handleSubmission(payload: any) {
  const meta = JSON.parse(payload.view?.private_metadata || '{}');
  const values = payload.view?.state?.values ?? {};

  const text = String(values.text_block?.text?.value ?? '').trim();
  const propertyValue = values.property_block?.property?.selected_option?.value ?? 'none';
  const destination = values.destination_block?.destination?.selected_option?.value ?? 'message';
  const stage = values.stage_block?.stage?.selected_option?.value ?? 'Under Contract';
  const visible = (values.visibility_block?.visible?.selected_options ?? []).length > 0;
  const isInternal = !visible;

  const err = (block: string, message: string) => ({
    response_action: 'errors',
    errors: { [block]: message.slice(0, 300) },
  });

  if (!text) return err('text_block', 'Enter the text to publish.');

  const db = admin();

  const { data: portal } = await db
    .from('client_accounts')
    .select('id, full_name, email, slack_channel_id')
    .eq('id', meta.portal_id)
    .maybeSingle();
  if (!portal) return err('text_block', 'That portal no longer exists.');
  // Re-check the link in case the channel was unlinked while the modal was open.
  if (portal.slack_channel_id !== meta.channel_id) {
    return err('text_block', 'This channel is no longer linked to that portal.');
  }

  const member = await resolveTeamMember(meta.slack_user_id ?? payload.user?.id);
  if ('error' in member) return err('text_block', member.error);

  // -- Membership guard -----------------------------------------------------
  // If the portal's client is a member of this channel, publishing is refused:
  // the channel is not a safe internal space for that deal.
  const guard = await clientIsInChannel(meta.channel_id, portal.email);
  if (guard.blocked) {
    return err(
      'text_block',
      `Refused: ${guard.reason} Publishing from a channel the client can read defeats the internal/visible split. Move the discussion to a team-only channel.`,
    );
  }

  const cleaned = stripSlackArtifacts(text, new Map());
  if (!cleaned) return err('text_block', 'Nothing left to publish after removing Slack formatting.');

  const publishedBy = member.profile.id;
  let publishedLabel = '';

  if (destination === 'timeline') {
    const { error } = await db.from('portal_timeline_notes').insert({
      client_account_id: portal.id,
      user_id: publishedBy,
      stage,
      note: cleaned,
      is_internal: isInternal,
      property_id: propertyValue === 'none' ? null : propertyValue,
      source_slack_channel_id: meta.channel_id,
      source_slack_ts: meta.ts,
      published_by: publishedBy,
    });
    if (error) {
      console.error('timeline insert failed:', error);
      return err('text_block', `Could not save the timeline note: ${error.message}`);
    }
    publishedLabel = `timeline note (${stage})`;
  } else {
    const { error } = await db.from('portal_messages').insert({
      portal_id: portal.id,
      sender_type: 'agent',
      sender_name: member.profile.full_name || 'Your Agent',
      sender_user_id: publishedBy,
      message_body: cleaned,
      is_internal: isInternal,
      property_id: propertyValue === 'none' ? null : propertyValue,
      source_slack_channel_id: meta.channel_id,
      source_slack_ts: meta.ts,
      published_by: publishedBy,
    });
    if (error) {
      console.error('message insert failed:', error);
      if ((error as any).code === '23505') {
        return err('text_block', 'That Slack message has already been published to this portal.');
      }
      return err('text_block', `Could not save the portal message: ${error.message}`);
    }
    publishedLabel = 'portal message';
  }

  // -- Confirmation back into the source thread -----------------------------
  const visibilityLine = isInternal
    ? ':lock: *Internal only* — the client cannot see this.'
    : ':eyes: *Visible to the client.*';
  await slackPost('chat.postMessage', {
    channel: meta.channel_id,
    thread_ts: meta.thread_ts || meta.ts,
    text:
      `:outbox_tray: Published to *${portal.full_name || portal.email}*'s portal as a ${publishedLabel} ` +
      `by *${member.profile.full_name || member.email}*.\n${visibilityLine}`,
  });

  return { response_action: 'clear' };
}

/** True when the portal's client email belongs to a member of the channel. */
async function clientIsInChannel(channelId: string, clientEmail: string) {
  if (!clientEmail) return { blocked: false, reason: '' };

  const lookup = await slackGet('users.lookupByEmail', { email: clientEmail });
  if (!lookup.ok) {
    // users_not_found is the common, safe case: the client has no Slack account.
    if (lookup.error === 'users_not_found') return { blocked: false, reason: '' };
    // Any other failure (missing scope, rate limit) must fail closed.
    return {
      blocked: true,
      reason: `the membership check could not run (Slack said "${lookup.error}").`,
    };
  }

  const clientSlackId = lookup.user?.id;
  let cursor = '';
  do {
    const params: Record<string, string> = { channel: channelId, limit: '200' };
    if (cursor) params.cursor = cursor;
    const page = await slackGet('conversations.members', params);
    if (!page.ok) {
      return {
        blocked: true,
        reason: `the channel membership could not be read (Slack said "${page.error}").`,
      };
    }
    if ((page.members ?? []).includes(clientSlackId)) {
      return {
        blocked: true,
        reason: `the client (${clientEmail}) is a member of this Slack channel.`,
      };
    }
    cursor = page.response_metadata?.next_cursor ?? '';
  } while (cursor);

  return { blocked: false, reason: '' };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rawBody = await req.text();
  const sigError = await verifySlackSignature(req, rawBody);
  if (sigError) {
    console.warn('Rejected Slack request:', sigError);
    return new Response(JSON.stringify({ error: sigError }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: any;
  try {
    const params = new URLSearchParams(rawBody);
    payload = JSON.parse(params.get('payload') ?? '{}');
  } catch (_e) {
    return new Response(JSON.stringify({ error: 'Malformed payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    if (payload.type === 'message_action' && payload.callback_id === SHORTCUT_CALLBACK_ID) {
      await handleShortcut(payload);
      return new Response('', { status: 200 });
    }

    if (payload.type === 'view_submission' && payload.view?.callback_id === VIEW_CALLBACK_ID) {
      const result = await handleSubmission(payload);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Anything else is ignored on purpose.
    console.log('Ignored Slack interaction:', payload.type, payload.callback_id ?? '');
    return new Response('', { status: 200 });
  } catch (e) {
    console.error('slack-interactivity error:', e);
    return new Response('', { status: 200 });
  }
});
