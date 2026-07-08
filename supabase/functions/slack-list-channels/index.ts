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

  const channels: SlackChannel[] = []
  let cursor = ''
  try {
    // Paginate through both public and private channels the bot can see.
    do {
      const url = new URL('https://slack.com/api/conversations.list')
      url.searchParams.set('limit', '200')
      url.searchParams.set('exclude_archived', 'true')
      url.searchParams.set('types', 'public_channel,private_channel')
      if (cursor) url.searchParams.set('cursor', cursor)

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      if (!data.ok) {
        console.error('conversations.list failed:', data)
        return new Response(
          JSON.stringify({ error: data.error || 'Slack API error', details: data }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      for (const c of data.channels ?? []) {
        channels.push({
          id: c.id,
          name: c.name,
          is_private: !!c.is_private,
          is_archived: !!c.is_archived,
        })
      }
      cursor = data.response_metadata?.next_cursor || ''
    } while (cursor)

    channels.sort((a, b) => a.name.localeCompare(b.name))
    return new Response(JSON.stringify({ channels }), {
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