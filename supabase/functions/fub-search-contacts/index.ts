import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireStaff } from '../_shared/auth.ts';

import { fubAuthHeaderForUser } from '../_shared/fub.ts';

// Credentials are scoped to the caller's organization; throws when that org
// has no Follow Up Boss key. There is never a cross-org fallback.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const guard = await requireStaff(req, { cors: corsHeaders });
  if (!guard.ok) return guard.response;
  const authHeader = () => fubAuthHeaderForUser(guard.caller.userId);
  try {
    const { query } = await req.json();
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const q = query.trim();
    const isEmail = q.includes('@');
    const isPhone = /^[\d\s()+\-.]{7,}$/.test(q);

    // FUB v1 /people does not support fulltext `query`; use specific params.
    // FUB v1 /people supports fulltext with `?name=` OR `?email=` OR `?phone=`.
    // But name matching is exact — for fuzzy typeahead we hit the search endpoint.
    const params = new URLSearchParams({ limit: '10' });
    if (isEmail) params.set('email', q);
    else if (isPhone) params.set('phone', q.replace(/\D/g, ''));
    else {
      // Full-text search parameter used by FUB app
      params.set('name', q);
    }

    const url = `https://api.followupboss.com/v1/people?${params.toString()}`;
    const resp = await fetch(url, {
      headers: { Authorization: await authHeader(), Accept: 'application/json' },
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`FUB search failed [${resp.status}]: ${text}`);
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