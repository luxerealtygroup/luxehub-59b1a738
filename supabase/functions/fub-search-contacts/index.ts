import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const FUB_API_KEY = Deno.env.get('FUB_API_KEY') || Deno.env.get('FOLLOW_UP_BOSS_API_KEY') || '';

function authHeader() {
  return 'Basic ' + btoa(`${FUB_API_KEY}:`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { query } = await req.json();
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const url = `https://api.followupboss.com/v1/people?query=${encodeURIComponent(query.trim())}&limit=10`;
    const resp = await fetch(url, {
      headers: { Authorization: authHeader(), Accept: 'application/json' },
    });
    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ error: 'FUB request failed', detail: text }), {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const data = await resp.json();
    const people = (data.people || []).map((p: any) => ({
      id: String(p.id),
      name: p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || `Contact #${p.id}`,
      email: p.emails?.[0]?.value || null,
      phone: p.phones?.[0]?.value || null,
    }));
    return new Response(JSON.stringify({ results: people }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});