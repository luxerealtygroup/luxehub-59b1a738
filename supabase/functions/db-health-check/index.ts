import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Tables that must always be readable/writable by signed-in users.
const CRITICAL_TABLES = [
  'weekly_411',
  'profiles',
  'user_roles',
  'pipeline_clients',
  'client_accounts',
  'portal_messages',
  'submissions',
  'coaching_sessions',
  'cma_reports',
  'notifications',
  'commissions',
  'manual_production',
]

const SLACK_CHANNEL = Deno.env.get('SLACK_ALERT_CHANNEL') ?? '#general'

async function postToSlack(text: string) {
  const token = Deno.env.get('SLACK_BOT_TOKEN')
  if (!token) return { ok: false, error: 'SLACK_BOT_TOKEN not configured' }
  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: SLACK_CHANNEL,
      username: 'LUXEhub Health',
      icon_emoji: ':rotating_light:',
      text,
    }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.ok) {
    console.error('slack chat.postMessage failed', resp.status, data)
    return { ok: false, error: data.error ?? `HTTP ${resp.status}` }
  }
  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const failures: string[] = []

  try {
    // 1. Grant check — does the `authenticated` role still have CRUD on each table?
    const { data: grants, error: grantErr } = await admin.rpc('check_table_grants', {
      _tables: CRITICAL_TABLES,
    })
    if (grantErr) {
      failures.push(`Grant check RPC failed: ${grantErr.message}`)
    } else {
      for (const row of (grants ?? []) as Array<Record<string, unknown>>) {
        const missing = ['can_select', 'can_insert', 'can_update', 'can_delete']
          .filter((k) => row[k] === false)
          .map((k) => k.replace('can_', '').toUpperCase())
        if (!row.table_exists) {
          failures.push(`Table \`${row.table_name}\` is missing`)
        } else if (missing.length) {
          failures.push(`\`${row.table_name}\` — authenticated role lost ${missing.join(', ')}`)
        } else if (row.rls_enabled === false) {
          failures.push(`\`${row.table_name}\` — RLS is DISABLED`)
        }
      }
    }

    // 2. Live read check through the Data API using the anon key (PostgREST reachability).
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )
    const { error: apiErr } = await anon.from('profiles').select('id').limit(1)
    if (apiErr && !/row-level security|permission denied for table/i.test(apiErr.message)) {
      failures.push(`Data API unreachable: ${apiErr.message}`)
    }
  } catch (e) {
    failures.push(`Health check crashed: ${e instanceof Error ? e.message : String(e)}`)
  }

  let slack: { ok: boolean; error?: string } | null = null
  if (failures.length) {
    const body = [
      ':rotating_light: *LUXEhub database health check FAILED*',
      '',
      ...failures.map((f) => `• ${f}`),
      '',
      '_Writes from the app are likely failing right now._',
    ].join('\n')
    slack = await postToSlack(body)
  }

  return new Response(
    JSON.stringify({ healthy: failures.length === 0, failures, slack, checked_at: new Date().toISOString() }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
