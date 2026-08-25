import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface SlackChannel {
  id: string
  name: string
  is_private: boolean
  is_archived: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const token = Deno.env.get('SLACK_BOT_TOKEN')
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'SLACK_BOT_TOKEN is not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Fetch all conversations of the given types, paginating through cursor results.
  // Returns { ok, channels, error, missingScope }. If Slack reports missing_scope,
  // `missingScope` is set to the needed scope and `ok` is false.
  const fetchConversations = async (types: string) => {
    const out: SlackChannel[] = []
    let cursor = ''
    do {
      const url = new URL('https://slack.com/api/conversations.list')
      url.searchParams.set('limit', '200')
      url.searchParams.set('exclude_archived', 'true')
      url.searchParams.set('types', types)
      if (cursor) url.searchParams.set('cursor', cursor)

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      if (!data.ok) {
        return { ok: false, channels: out, error: data.error || 'Slack API error', details: data }
      }
      for (const c of data.channels ?? []) {
        out.push({
          id: c.id,
          name: c.name,
          is_private: !!c.is_private,
          is_archived: !!c.is_archived,
        })
      }
      cursor = data.response_metadata?.next_cursor || ''
    } while (cursor)
    return { ok: true, channels: out, error: null, details: null }
  }

  try {
    // First attempt: list both public and private channels. Private channels
    // require the `groups:read` scope; if the bot lacks it, Slack rejects the
    // whole call with `missing_scope` (needed: groups:read) and returns nothing.
    let result = await fetchConversations('public_channel,private_channel')

    // If private listing isn't permitted, fall back to public-only so the
    // picker still works for public channels today, before the scope is added.
    if (!result.ok && result.error === 'missing_scope') {
      console.warn('private channels unavailable, retrying public-only:', result.details)
      result = await fetchConversations('public_channel')
    }

    if (!result.ok) {
      console.error('conversations.list failed:', result.details)
      return new Response(
        JSON.stringify({ error: result.error, details: result.details }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    result.channels.sort((a, b) => a.name.localeCompare(b.name))
    return new Response(JSON.stringify({ channels: result.channels }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('slack-list-channels error:', e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})