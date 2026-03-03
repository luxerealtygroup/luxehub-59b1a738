import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FUB_API_KEY = Deno.env.get('FOLLOW_UP_BOSS_API_KEY');
const FUB_BASE_URL = 'https://api.followupboss.com/v1';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!FUB_API_KEY) {
      console.error('FOLLOW_UP_BOSS_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Follow Up Boss API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, params } = await req.json();
    console.log('FUB Action:', action, 'Params:', params);

    const authHeader = 'Basic ' + btoa(FUB_API_KEY + ':');

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
        const dealParams = new URLSearchParams();
        if (params?.limit) dealParams.append('limit', params.limit.toString());
        if (params?.offset) dealParams.append('offset', params.offset.toString());
        if (params?.stage) dealParams.append('stage', params.stage);
        endpoint = `/deals?${dealParams.toString()}`;
        break;
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
