// First-run setup: the instance owner connects their own integrations.
//
// Hard rules enforced here:
//  - Owner role only. Checked server-side against user_roles, not the UI.
//  - WRITE-ONLY. No response from this function ever contains a credential
//    value, for anyone, including admins. Only status metadata is returned.
//  - Credentials are validated against the live provider before being stored.
//  - Values are stored in Supabase Vault, never in a table column.
//  - Nothing logs a credential; provider error text is redacted before use.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  clearInstanceSecretCache,
  getInstanceSecret,
  resolveInstanceSecret,
  redact,
  type InstanceSecretKey,
} from '../_shared/instanceSecrets.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const KEYS: InstanceSecretKey[] = ['FUB_API_KEY', 'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

/** 401 unauthenticated, 403 anything that is not the owner role. */
async function requireOwner(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'UNAUTHORIZED' }, 401);
  const token = authHeader.slice(7).trim();
  if (!token) return json({ error: 'UNAUTHORIZED' }, 401);

  const supabase = admin();
  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return json({ error: 'UNAUTHORIZED' }, 401);

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);
  const isOwner = (roles ?? []).some((r: { role: string }) => r.role === 'owner');
  if (!isOwner) return json({ error: 'FORBIDDEN_OWNER_ONLY' }, 403);

  return { userId: user.id };
}

// ---------------------------------------------------------------------------
// Live validation. Each returns { ok, message } and never echoes the value.
// ---------------------------------------------------------------------------

async function testFub(key: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('https://api.followupboss.com/v1/identity', {
      headers: {
        Authorization: 'Basic ' + btoa(`${key}:`),
        Accept: 'application/json',
        'X-System': 'Real Estate Hub',
        'X-System-Key': 'lovable-hub',
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Follow Up Boss rejected that key (unauthorized).' };
    }
    if (!res.ok) {
      return { ok: false, message: `Follow Up Boss returned ${res.status}.` };
    }
    const body = await res.json().catch(() => null);
    const account = body?.account?.name || body?.name;
    return { ok: true, message: account ? `Connected to ${account}` : 'Connected' };
  } catch (e) {
    return { ok: false, message: redact(`Could not reach Follow Up Boss: ${(e as Error).message}`, key) };
  }
}

async function testSlackToken(token: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('https://slack.com/api/auth.test', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({ ok: false, error: 'non_json_response' }));
    if (!data.ok) {
      return { ok: false, message: `Slack rejected that token (${data.error ?? 'unknown_error'}).` };
    }
    return { ok: true, message: `Connected to ${data.team}` };
  } catch (e) {
    return { ok: false, message: redact(`Could not reach Slack: ${(e as Error).message}`, token) };
  }
}

/**
 * The signing secret has no verification endpoint. Slack always issues a
 * 32-character hex string, so we shape-check it rather than pretend to test it.
 */
function testSigningSecret(secret: string): { ok: boolean; message: string } {
  if (!/^[a-f0-9]{32}$/i.test(secret.trim())) {
    return {
      ok: false,
      message:
        "That doesn't look like a Slack signing secret — it should be 32 hexadecimal characters from Basic Information.",
    };
  }
  return { ok: true, message: 'Saved' };
}

async function liveStatus(key: InstanceSecretKey): Promise<{ ok: boolean; message: string }> {
  const value = await getInstanceSecret(key);
  if (!value) return { ok: false, message: 'Not connected' };
  if (key === 'FUB_API_KEY') return await testFub(value);
  if (key === 'SLACK_BOT_TOKEN') return await testSlackToken(value);
  return { ok: true, message: 'Configured' };
}

/** Status only — metadata, never a value. */
async function buildStatus(includeLive: boolean) {
  const { data: rows } = await admin()
    .from('instance_integrations')
    .select('key, last4, updated_at');
  const byKey = new Map((rows ?? []).map((r: any) => [r.key, r]));

  return await Promise.all(
    KEYS.map(async (key) => {
      const { source } = await resolveInstanceSecret(key);
      const row = byKey.get(key);
      return {
        key,
        configured: source !== 'none',
        source, // 'vault' = owner-entered, 'env' = inherited project secret
        last4: source === 'vault' ? row?.last4 ?? null : null,
        savedAt: source === 'vault' ? row?.updated_at ?? null : null,
        live: includeLive ? await liveStatus(key) : null,
      };
    }),
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const gate = await requireOwner(req);
  if (gate instanceof Response) return gate;

  let body: { action?: string; key?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const action = body.action ?? 'status';

  try {
    if (action === 'status') {
      return json({ integrations: await buildStatus(true) });
    }

    if (action === 'save') {
      const key = body.key as InstanceSecretKey;
      if (!KEYS.includes(key)) return json({ error: 'Unknown integration' }, 400);

      const value = (body.value ?? '').trim();
      // Scrub the value off the parsed body immediately so nothing downstream
      // can accidentally serialize it.
      body.value = '';
      if (!value) return json({ error: 'Enter a value before saving.' }, 400);
      if (value.length > 500) return json({ error: 'That value is too long to be valid.' }, 400);

      const check =
        key === 'FUB_API_KEY'
          ? await testFub(value)
          : key === 'SLACK_BOT_TOKEN'
            ? await testSlackToken(value)
            : testSigningSecret(value);

      if (!check.ok) {
        return json({ error: check.message, validated: false }, 400);
      }

      const { error } = await admin().rpc('set_instance_secret', {
        _key: key,
        _value: value,
        _actor: gate.userId,
      });
      if (error) {
        // Redact defensively: a Postgres error could echo the statement back.
        console.error('instance-setup save failed:', redact(error.message, value));
        return json({ error: 'Could not save the credential. Try again.' }, 500);
      }

      clearInstanceSecretCache(key);
      console.log(`instance-setup: ${key} updated by owner ${gate.userId}`);
      return json({ ok: true, message: check.message, integrations: await buildStatus(false) });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    // Never let an exception carry the value into the response or the log.
    const safe = redact((e as Error).message ?? 'unexpected error', body?.value);
    console.error('instance-setup error:', safe);
    return json({ error: 'Something went wrong.' }, 500);
  }
});
