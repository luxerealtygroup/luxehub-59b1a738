import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-view-as-user-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FUB_API_KEY_PRIMARY = Deno.env.get('FOLLOW_UP_BOSS_API_KEY');
const FUB_API_KEY_SECONDARY = Deno.env.get('FOLLOW_UP_BOSS_API_KEY_2');
const FUB_BASE_URL = 'https://api.followupboss.com/v1';

// Retry transient network failures (connection reset, timeouts) against FUB.
async function fubFetch(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * 2 ** i));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      console.warn(`FUB fetch attempt ${i + 1} failed:`, (e as Error).message);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * 2 ** i));
    }
  }
  throw lastErr;
}

const STAFF_ROLES = new Set(['owner', 'admin', 'agent', 'planning_access']);
const WRITE_ACTIONS = new Set(['create_person', 'update_person', 'create_note', 'add_tag', 'create_event']);
const CLIENT_ALLOWED_ACTIONS = new Set(['get_person_deals']);

type Caller =
  | { kind: 'service'; userId: null; isAdmin: true; canWrite: true }
  | { kind: 'staff'; userId: string; isAdmin: boolean; canWrite: boolean }
  | { kind: 'client'; userId: string; isAdmin: false; canWrite: false; personIds: number[] };

function json(bodyObj: unknown, status = 200) {
  return new Response(JSON.stringify(bodyObj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

/** Resolve and verify the caller. Returns null when authentication fails. */
async function resolveCaller(req: Request): Promise<Caller | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  // Internal server-to-server calls (other edge functions) use the service role key.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (serviceKey && token === serviceKey) {
    return { kind: 'service', userId: null, isAdmin: true, canWrite: true };
  }

  const supabase = admin();
  const { data: userData, error } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (error || !user) return null;

  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);
  const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
  const isAdmin = roles.includes('admin') || roles.includes('owner');
  const isStaffRole = roles.some((r) => STAFF_ROLES.has(r));

  if (isStaffRole) {
    return {
      kind: 'staff',
      userId: user.id,
      isAdmin,
      canWrite: isAdmin || roles.includes('agent'),
    };
  }

  // Every signup gets a profiles row, so an explicit portal link (client_accounts
  // .user_id) is checked BEFORE the profiles fallback for team membership.
  const email = (user.email ?? '').toLowerCase();
  const toPersonIds = (rows: { fub_person_id: number | string | null }[]) =>
    rows
      .map((a) => Number(a.fub_person_id))
      .filter((n) => Number.isFinite(n) && n > 0);

  const { data: byUser } = await supabase
    .from('client_accounts')
    .select('fub_person_id')
    .eq('user_id', user.id);
  if ((byUser ?? []).length > 0) {
    return { kind: 'client', userId: user.id, isAdmin: false, canWrite: false, personIds: toPersonIds(byUser!) };
  }

  // Team member without an explicit role row.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (profile) {
    return { kind: 'staff', userId: user.id, isAdmin: false, canWrite: true };
  }

  // Unclaimed portal invite matched by email.
  if (email) {
    const { data: byEmail } = await supabase
      .from('client_accounts')
      .select('fub_person_id')
      .ilike('email', email);
    if ((byEmail ?? []).length > 0) {
      return { kind: 'client', userId: user.id, isAdmin: false, canWrite: false, personIds: toPersonIds(byEmail!) };
    }
  }

  // Unknown identity: treat as a client with no scope (everything 403s).
  return { kind: 'client', userId: user.id, isAdmin: false, canWrite: false, personIds: [] };


}

/** Which FUB API key to use, honoring admin-only "view as" impersonation. */
async function resolveApiKey(req: Request, caller: Caller): Promise<string | null> {
  try {
    if (caller.kind === 'client') return FUB_API_KEY_PRIMARY ?? null;
    const supabase = admin();

    let targetUserId = caller.userId;
    const viewAsUserId = req.headers.get('x-view-as-user-id');
    if (viewAsUserId && viewAsUserId !== caller.userId) {
      // Admin-only: verified against user_roles, never trusted from the header.
      if (caller.isAdmin) targetUserId = viewAsUserId;
      else console.warn('x-view-as-user-id ignored for non-admin caller', caller.userId);
    }
    if (!targetUserId) return FUB_API_KEY_PRIMARY ?? null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('fub_account')
      .eq('id', targetUserId)
      .maybeSingle();
    if (profile?.fub_account === 'secondary' && FUB_API_KEY_SECONDARY) {
      return FUB_API_KEY_SECONDARY;
    }
    return FUB_API_KEY_PRIMARY ?? null;
  } catch (e) {
    console.error('resolveApiKey error', e);
    return FUB_API_KEY_PRIMARY ?? null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const caller = await resolveCaller(req);
    if (!caller) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }

    const { action, params } = await req.json();
    console.log('FUB Action:', action, 'caller:', caller.kind);

    // ---- Authorization ----
    if (WRITE_ACTIONS.has(action) && !(caller.kind === 'service' || caller.canWrite)) {
      return json({ success: false, error: 'Forbidden' }, 403);
    }

    if (caller.kind === 'client') {
      if (!CLIENT_ALLOWED_ACTIONS.has(action)) {
        console.warn('Client attempted disallowed FUB action:', action, caller.userId);
        return json({ success: false, error: 'Forbidden' }, 403);
      }
      const requested = Number(params?.personId);
      if (!Number.isFinite(requested) || !caller.personIds.includes(requested)) {
        console.warn('Client attempted mismatched personId:', params?.personId, caller.userId);
        return json({ success: false, error: 'Forbidden' }, 403);
      }
    }

    const apiKey = await resolveApiKey(req, caller);
    if (!apiKey) {
      console.error('FOLLOW_UP_BOSS_API_KEY not configured');
      return json({ success: false, error: 'Follow Up Boss API key not configured' }, 500);
    }

    const authHeader = 'Basic ' + btoa(apiKey + ':');


    let endpoint = '';
    let method = 'GET';
    let body = null;

    switch (action) {
      case 'search_people': {
        // FUB /v1/people filters are SINGULAR: ?email= / ?phone= / ?name=.
        // The plural forms (`emails`, `phones`) are silently ignored by FUB and
        // the endpoint then returns the ENTIRE contact list, which used to make
        // an email lookup look like "every contact in the database".
        const rawQuery = typeof params?.query === 'string' ? params.query.trim() : '';
        if (!rawQuery) {
          // Never fall through to an unfiltered list dump.
          return new Response(
            JSON.stringify({ success: true, data: { people: [], _metadata: { collection: 'people', total: 0 } } }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        const digits = rawQuery.replace(/\D/g, '');
        const isEmail = rawQuery.includes('@');
        const isPhone = !isEmail && /^[\d\s()+\-.]+$/.test(rawQuery) && digits.length >= 7;

        const searchParams = new URLSearchParams();
        if (isEmail) searchParams.append('email', rawQuery);
        else if (isPhone) searchParams.append('phone', digits);
        else searchParams.append('name', rawQuery);
        const limit = Math.min(Number(params?.limit) || 20, 50);
        searchParams.append('limit', limit.toString());

        const url = `${FUB_BASE_URL}/people?${searchParams.toString()}`;
        console.log('Calling FUB endpoint:', url);
        const r = await fubFetch(url, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'X-System': 'Lovable Real Estate Hub',
            'X-System-Key': 'lovable-hub',
          },
        });
        const j = await r.json();
        if (!r.ok) {
          console.error('FUB API error (search_people):', r.status, j);
          return new Response(
            JSON.stringify({ success: false, error: j?.message || `API error: ${r.status}` }),
            { status: r.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        let people = Array.isArray(j?.people) ? j.people : [];
        const reportedTotal = Number(j?._metadata?.total ?? people.length);

        // Defensive guard: if FUB ever ignores a filter again, verify the rows
        // actually match instead of handing the agent the whole database.
        const needle = rawQuery.toLowerCase();
        const matches = (p: Record<string, unknown>) => {
          if (isEmail) {
            return (p.emails as { value?: string }[] | undefined)?.some(
              (e) => (e?.value ?? '').toLowerCase() === needle,
            ) ?? false;
          }
          if (isPhone) {
            return (p.phones as { value?: string; normalized?: string }[] | undefined)?.some(
              (ph) => ((ph?.normalized ?? ph?.value ?? '') as string).replace(/\D/g, '').endsWith(digits),
            ) ?? false;
          }
          const name = String(p.name ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`).toLowerCase();
          return name.includes(needle);
        };
        const filtered = people.filter(matches);
        if (filtered.length !== people.length) {
          console.warn(
            `search_people: FUB returned ${people.length} rows (total=${reportedTotal}) for "${rawQuery}"; ` +
            `${filtered.length} actually match — filter appears to have been ignored.`,
          );
        }
        people = filtered;

        return new Response(
          JSON.stringify({
            success: true,
            data: { people, _metadata: { collection: 'people', total: people.length } },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }


      case 'get_person':
        endpoint = `/people/${params.id}`;
        break;

      case 'get_person_deals': {
        // Return every deal for a specific FUB person so the client portal
        // can render a timeline of the actual stages that person's deals hit.
        const personId = Number(params?.personId);
        if (!personId) {
          return new Response(
            JSON.stringify({ success: false, error: 'personId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const dp = new URLSearchParams();
        dp.append('personId', personId.toString());
        dp.append('limit', '100');
        endpoint = `/deals?${dp.toString()}`;
        break;
      }

      case 'get_people': {
        const peopleParams = new URLSearchParams();
        if (params?.limit) peopleParams.append('limit', params.limit.toString());
        if (params?.offset) peopleParams.append('offset', params.offset.toString());
        if (params?.sort) peopleParams.append('sort', params.sort);
        endpoint = `/people?${peopleParams.toString()}`;
        break;
      }

      case 'get_deals': {
        // Paginate by default. Caller can opt out with `all: false`, in which
        // case the original limit/offset semantics are preserved.
        const shouldPaginate = params?.all !== false;
        const pageSize = Math.min(Number(params?.limit) || 100, 100);
        const startOffset = Number(params?.offset) || 0;
        const SAFETY_CAP = 10_000;

        const allDeals: unknown[] = [];
        let offset = startOffset;
        let total = 0;

        while (true) {
          const dp = new URLSearchParams();
          dp.append('limit', pageSize.toString());
          dp.append('offset', offset.toString());
          if (params?.stage) dp.append('stage', params.stage);
          const url = `${FUB_BASE_URL}/deals?${dp.toString()}`;
          console.log('Calling FUB endpoint:', url, `(page offset=${offset})`);
          const r = await fubFetch(url, {
            method: 'GET',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
              'X-System': 'Lovable Real Estate Hub',
              'X-System-Key': 'lovable-hub',
            },
          });
          const j = await r.json();
          if (!r.ok) {
            console.error('FUB API error (get_deals page):', r.status, j);
            return new Response(
              JSON.stringify({ success: false, error: j?.message || `API error: ${r.status}` }),
              { status: r.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          const pageDeals = Array.isArray(j?.deals) ? j.deals : [];
          allDeals.push(...pageDeals);
          total = Number(j?._metadata?.total ?? allDeals.length);
          offset += pageDeals.length;
          if (!shouldPaginate) break;
          if (pageDeals.length < pageSize) break;
          if (allDeals.length >= total) break;
          if (allDeals.length >= SAFETY_CAP) {
            console.warn(`get_deals SAFETY_CAP (${SAFETY_CAP}) reached`);
            break;
          }
        }

        console.log(`FUB get_deals returned ${allDeals.length} deals (total reported=${total})`);
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              deals: allDeals,
              _metadata: { collection: 'deals', total: allDeals.length, offset: startOffset, limit: allDeals.length },
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_notes': {
        const notesParams = new URLSearchParams();
        if (params?.limit) notesParams.append('limit', params.limit.toString());
        if (params?.offset) notesParams.append('offset', params.offset.toString());
        if (params?.personId) notesParams.append('personId', params.personId.toString());
        endpoint = `/notes?${notesParams.toString()}`;
        break;
      }

      case 'get_calls': {
        const callsParams = new URLSearchParams();
        if (params?.limit) callsParams.append('limit', params.limit.toString());
        if (params?.offset) callsParams.append('offset', params.offset.toString());
        if (params?.personId) callsParams.append('personId', params.personId.toString());
        endpoint = `/calls?${callsParams.toString()}`;
        break;
      }

      case 'get_smartlists': {
        const smartListParams = new URLSearchParams();
        if (params?.limit) smartListParams.append('limit', params.limit.toString());
        if (params?.offset) smartListParams.append('offset', params.offset.toString());
        smartListParams.append('all', 'true');
        endpoint = `/smartLists?${smartListParams.toString()}`;
        break;
      }

      case 'get_smartlist_people': {
        const smartListPeopleParams = new URLSearchParams();
        smartListPeopleParams.append('smartListId', params.id.toString());
        if (params?.limit) smartListPeopleParams.append('limit', params.limit.toString());
        if (params?.offset) smartListPeopleParams.append('offset', params.offset.toString());
        endpoint = `/people?${smartListPeopleParams.toString()}`;
        break;
      }

      case 'get_users': {
        const usersParams = new URLSearchParams();
        if (params?.limit) usersParams.append('limit', params.limit.toString());
        endpoint = `/users?${usersParams.toString()}`;
        break;
      }

      case 'create_person': {
        method = 'POST';
        endpoint = '/people';
        body = {
          firstName: params.firstName || '',
          lastName: params.lastName || '',
          emails: params.email ? [{ value: params.email, type: 'home' }] : [],
          phones: params.phone ? [{ value: params.phone, type: 'mobile' }] : [],
          source: params.source || 'Lovable Pipeline',
          tags: params.tags || [],
          ...(params.notes && { background: params.notes }),
        };
        break;
      }

      case 'update_person': {
        method = 'PUT';
        endpoint = `/people/${params.id}`;
        const updateBody: Record<string, unknown> = {};
        if (params.firstName) updateBody.firstName = params.firstName;
        if (params.lastName) updateBody.lastName = params.lastName;
        if (params.email) updateBody.emails = [{ value: params.email, type: 'home' }];
        if (params.phone) updateBody.phones = [{ value: params.phone, type: 'mobile' }];
        if (params.tags) updateBody.tags = params.tags;
        if (params.notes) updateBody.background = params.notes;
        body = updateBody;
        break;
      }

      case 'create_note': {
        // Create a note on a FUB contact
        method = 'POST';
        endpoint = '/notes';
        body = {
          personId: params.personId,
          subject: params.subject || 'CMA Report',
          body: params.body || '',
          isHtml: params.isHtml || false,
        };
        break;
      }

      case 'add_tag': {
        // Add a tag to a FUB contact by updating the person with the tag
        method = 'PUT';
        endpoint = `/people/${params.personId}`;
        body = {
          tags: [params.tag],
          mergeTagsOnUpdate: true,
        };
        break;
      }

      case 'create_event': {
        // Create a timeline event on a FUB contact
        method = 'POST';
        endpoint = '/events';
        body = {
          personId: params.personId,
          type: params.type || 'Other',
          description: params.description || '',
          source: 'CMA Boss',
          system: 'Lovable Real Estate Hub',
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    console.log('Calling FUB endpoint:', FUB_BASE_URL + endpoint);

    const response = await fubFetch(FUB_BASE_URL + endpoint, {
      method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'X-System': 'Lovable Real Estate Hub',
        'X-System-Key': 'lovable-hub'
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('FUB API error:', response.status, data);
      return new Response(
        JSON.stringify({ success: false, error: data.message || `API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('FUB response successful');
    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in follow-up-boss function:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
