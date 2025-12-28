import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Base64 encode the API key for Basic Auth (FUB uses API key as username, no password)
    const authHeader = 'Basic ' + btoa(FUB_API_KEY + ':');

    let endpoint = '';
    let method = 'GET';
    let body = null;

    switch (action) {
      case 'search_people':
        // Search for people/contacts
        const searchParams = new URLSearchParams();
        if (params?.query) searchParams.append('q', params.query);
        if (params?.limit) searchParams.append('limit', params.limit.toString());
        endpoint = `/people?${searchParams.toString()}`;
        break;

      case 'get_person':
        // Get a specific person by ID
        endpoint = `/people/${params.id}`;
        break;

      case 'get_people':
        // Get all people with optional filters
        const peopleParams = new URLSearchParams();
        if (params?.limit) peopleParams.append('limit', params.limit.toString());
        if (params?.offset) peopleParams.append('offset', params.offset.toString());
        if (params?.sort) peopleParams.append('sort', params.sort);
        if (params?.stage) peopleParams.append('stage', params.stage);
        endpoint = `/people?${peopleParams.toString()}`;
        break;

      case 'get_people_by_stage':
        // Get people by their stage in FUB
        const stageParams = new URLSearchParams();
        stageParams.append('stage', params.stage);
        if (params?.limit) stageParams.append('limit', params.limit.toString());
        endpoint = `/people?${stageParams.toString()}`;
        break;

      case 'get_deals':
        // Get deals from FUB
        const dealParams = new URLSearchParams();
        if (params?.limit) dealParams.append('limit', params.limit.toString());
        if (params?.offset) dealParams.append('offset', params.offset.toString());
        if (params?.stage) dealParams.append('stage', params.stage);
        endpoint = `/deals?${dealParams.toString()}`;
        break;

      case 'create_person':
        // Create a new person in Follow Up Boss
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

      case 'update_person':
        // Update an existing person in Follow Up Boss
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