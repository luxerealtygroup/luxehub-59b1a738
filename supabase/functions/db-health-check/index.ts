import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { tenant } from '../_shared/tenant.ts'
import { getInstanceSecret } from '../_shared/instanceSecrets.ts'

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

async function slackPost(token: string, method: string, body: Record<string, unknown>) {
  const resp = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  })
  return await resp.json()
}

async function findChannelId(token: string, name: string): Promise<string | null> {
  const target = name.replace(/^#/, '')
  let cursor = ''
  do {
    const url = new URL('https://slack.com/api/conversations.list')
    url.searchParams.set('limit', '200')
    url.searchParams.set('exclude_archived', 'true')
    url.searchParams.set('types', 'public_channel')
    if (cursor) url.searchParams.set('cursor', cursor)
    const data = await (await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })).json()
    if (!data.ok) return null
    const hit = (data.channels ?? []).find((c: { name: string }) => c.name === target)
    if (hit) return hit.id
    cursor = data.response_metadata?.next_cursor || ''
  } while (cursor)
  return null
}

async function postToSlack(text: string) {
  const token = await getInstanceSecret('SLACK_BOT_TOKEN')
  if (!token) return { ok: false, error: 'Slack is not connected for this instance' }

  const payload = {
    channel: SLACK_CHANNEL,
    username: `${tenant.appName} Health`,
    icon_emoji: ':rotating_light:',
    text,
  }

  let data = await slackPost(token, 'chat.postMessage', payload)

  // The bot may not be a member of the target channel yet — join and retry once.
  if (!data.ok && (data.error === 'not_in_channel' || data.error === 'channel_not_found')) {
    const channelId = SLACK_CHANNEL.startsWith('C')
      ? SLACK_CHANNEL
      : await findChannelId(token, SLACK_CHANNEL)
    if (channelId) {
      const joined = await slackPost(token, 'conversations.join', { channel: channelId })
      if (!joined.ok) console.error('conversations.join failed', joined)
      data = await slackPost(token, 'chat.postMessage', { ...payload, channel: channelId })
    }
  }

  if (!data.ok) {
    console.error('slack chat.postMessage failed', data)
    return { ok: false, error: data.error ?? 'unknown slack error' }
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
  const isTest = new URL(req.url).searchParams.get('test') === '1'

  if (isTest) {
    const slack = await postToSlack(
      `:white_check_mark: *${tenant.appName} health monitor test* — alerts will post here if the database ever breaks.`,
    )
    return new Response(JSON.stringify({ test: true, slack }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

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
      `:rotating_light: *${tenant.appName} database health check FAILED*`,
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
