import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-view-as-user-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FUB_API_KEY_PRIMARY = Deno.env.get('FOLLOW_UP_BOSS_API_KEY');
const FUB_API_KEY_SECONDARY = Deno.env.get('FOLLOW_UP_BOSS_API_KEY_2');
const FUB_BASE_URL = 'https://api.followupboss.com/v1';

async function resolveApiKey(req: Request): Promise<string | null> {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return FUB_API_KEY_PRIMARY ?? null;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return FUB_API_KEY_PRIMARY ?? null;

    // If caller is an admin/owner viewing as another agent, resolve that agent's fub_account
    let targetUserId = user.id;
    const viewAsUserId = req.headers.get('x-view-as-user-id');
    if (viewAsUserId && viewAsUserId !== user.id) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      const isAdmin = (roles || []).some((r: { role: string }) => r.role === 'admin' || r.role === 'owner');
      if (isAdmin) targetUserId = viewAsUserId;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('fub_account')
      .eq('id', targetUserId)
      .maybeSingle();
    if (profile?.fub_account === 'secondary' && FUB_API_KEY_SECONDARY) {
      console.log('Resolved FUB account: secondary');
      return FUB_API_KEY_SECONDARY;
    }
    console.log('Resolved FUB account: primary');
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
    const apiKey = await resolveApiKey(req);
    if (!apiKey) {
      console.error('FOLLOW_UP_BOSS_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Follow Up Boss API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, params } = await req.json();
    console.log('FUB Action:', action, 'Params:', params);

    const authHeader = 'Basic ' + btoa(apiKey + ':');

    let endpoint = '';
    let method = 'GET';
    let body = null;

    switch (action) {
      case 'search_people': {
        const searchParams = new URLSearchParams();
        if (params?.query) {
          searchParams.append('name', params.query);
        }
        if (params?.limit) searchParams.append('limit', params.limit.toString());
        endpoint = `/people?${searchParams.toString()}`;
        break;
      }

      case 'get_person':
        endpoint = `/people/${params.id}`;
        break;

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
          const r = await fetch(url, {
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

    const response = await fetch(FUB_BASE_URL + endpoint, {
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
