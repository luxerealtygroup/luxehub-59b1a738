import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const FUB_API_KEY = Deno.env.get('FUB_API_KEY') || Deno.env.get('FOLLOW_UP_BOSS_API_KEY') || '';

function authHeader() {
  return 'Basic ' + btoa(`${FUB_API_KEY}:`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { firstName, lastName, email } = await req.json();
    if (!firstName || typeof firstName !== 'string') {
      return new Response(JSON.stringify({ error: 'firstName is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body: Record<string, unknown> = {
      firstName: String(firstName).trim().slice(0, 100),
      lastName: lastName ? String(lastName).trim().slice(0, 100) : '',
      source: 'Open House',
    };
    if (email && typeof email === 'string') {
      body.emails = [{ value: String(email).trim().slice(0, 255) }];
    }
    const resp = await fetch('https://api.followupboss.com/v1/people', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'FUB create failed', detail: text }), {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const data = JSON.parse(text);
    return new Response(JSON.stringify({
      id: String(data.id),
      name: data.name || `${body.firstName} ${body.lastName}`.trim(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});