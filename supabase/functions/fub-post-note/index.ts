import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const FUB_API_KEY = Deno.env.get('FUB_API_KEY') || Deno.env.get('FOLLOW_UP_BOSS_API_KEY') || '';

function authHeader() {
  return 'Basic ' + btoa(`${FUB_API_KEY}:`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { personId, noteBody } = await req.json();
    if (!personId || !noteBody || typeof noteBody !== 'string') {
      return new Response(JSON.stringify({ error: 'personId and noteBody are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const resp = await fetch('https://api.followupboss.com/v1/notes', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        personId: isNaN(Number(personId)) ? personId : Number(personId),
        subject: 'Open House Feedback',
        body: String(noteBody).slice(0, 8000),
        isHtml: false,
      }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'FUB note failed', detail: text }), {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});