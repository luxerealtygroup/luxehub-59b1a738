import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-fub-signature',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('FUB Webhook received:', JSON.stringify(payload, null, 2));

    // FUB sends events like: person.created, person.updated, deal.created, deal.updated, etc.
    const { event, data } = payload;

    console.log('Event type:', event);
    console.log('Event data:', JSON.stringify(data, null, 2));

    // Log the webhook for debugging
    // In the future, you could trigger realtime updates to connected clients here
    // For now, we just acknowledge receipt

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook received',
        event 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing FUB webhook:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
