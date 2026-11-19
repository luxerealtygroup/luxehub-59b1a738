import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { getSlackToken, SLACK_API } from '../_shared/slack.ts';
import { FORM_TYPES, runHarness } from './harness.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const schema = z.discriminatedUnion('delete', [
  z.object({ delete: z.literal(false) }).strict(),
  z.object({ delete: z.literal(true), messages: z.array(z.object({
    channel: z.string().regex(/^[CG][A-Z0-9]+$/), ts: z.string().regex(/^\d+\.\d+$/),
  }).strict()).max(100) }).strict(),
]);

Deno.serve(async req => {
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const readGate = async () => {
    const { data, error } = await admin.from('_harness_gate').select('token').maybeSingle();
    return error || typeof data?.token !== 'string' ? null : data.token;
  };
  // Gate precedes all request processing, including preflight and malformed bodies.
  const header = req.headers.get('x-harness-token');
  let expected: string | null = null;
  try { expected = await readGate(); } catch { /* fail closed */ }
  if (!expected || !header || header !== expected) return json({ error: 'Unauthorized' }, 401);
  if (req.method !== 'POST') return json({ error: 'POST required.' }, 405);
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw && typeof raw === 'object' ? { ...raw, delete: raw.delete ?? false } : raw);
  if (!parsed.success) return json({ error: 'Invalid harness request.' }, 400);
  let token: string | null = null;
  const result = await runHarness(header, parsed.data, {
    readGate: async () => expected,
    readDestinations: async () => {
      const { data, error } = await admin.from('submission_slack_channels')
        .select('org_id,form_type,channel_id').in('form_type', [...FORM_TYPES]);
      if (error) throw new Error('Destination lookup failed.');
      return data ?? [];
    },
    slack: async (method, body) => {
      try {
        token ??= await getSlackToken();
        const response = await fetch(`${SLACK_API}/${method}`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({ ok: false, error: 'invalid_response' }));
        return {
          ok: response.ok && data.ok === true,
          channel: typeof data.channel === 'string' ? data.channel : undefined,
          ts: typeof data.ts === 'string' ? data.ts : undefined,
          // Only Slack error codes, never raw responses or credentials.
          error: data.ok === true && response.ok ? undefined :
            typeof data.error === 'string' && /^[a-z0-9_]+$/.test(data.error) ? data.error : 'slack_request_failed',
        };
      } catch { return { ok: false, error: 'slack_request_failed' }; }
    },
  });
  return json(result.body, result.status);
});