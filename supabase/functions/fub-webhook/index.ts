import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-fub-signature, fub-signature',
};

const WEBHOOK_SECRET = Deno.env.get('FUB_WEBHOOK_SECRET');

/** HMAC-SHA256 of the raw body using FUB_WEBHOOK_SECRET, compared in constant time. */
async function verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET || !signatureHeader) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
    const expectedHex = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const provided = signatureHeader.trim().toLowerCase().replace(/^sha256=/, '');
    if (expectedHex.length !== provided.length) return false;
    // Constant-time compare
    let diff = 0;
    for (let i = 0; i < expectedHex.length; i++) {
      diff |= expectedHex.charCodeAt(i) ^ provided.charCodeAt(i);
    }
    return diff === 0;
  } catch (e) {
    console.error('Signature verification error:', e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const signatureHeader =
      req.headers.get('x-fub-signature') ?? req.headers.get('fub-signature');

    if (!WEBHOOK_SECRET) {
      console.error('FUB_WEBHOOK_SECRET not configured — rejecting webhook');
      return new Response(
        JSON.stringify({ success: false, error: 'Webhook secret not configured' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const signatureValid = await verifySignature(rawBody, signatureHeader);
    if (!signatureValid) {
      console.warn('FUB webhook rejected: invalid signature');
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch (e) {
      console.error('Invalid JSON body:', e);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const eventType =
      (payload.eventType as string | undefined) ??
      (payload.event as string | undefined) ??
      'unknown';
    const resourceType = String(
      (payload.resourceType as string | undefined) ?? '',
    ).toLowerCase();
    const resourceId = payload.resourceId as number | string | undefined;
    const resourceData = (payload.resourceData ?? payload.data ?? {}) as Record<string, unknown>;

    console.log(
      `FUB webhook: event=${eventType} resourceType=${resourceType} resourceId=${resourceId}`,
    );

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let persisted = false;
    if (resourceType === 'deal' || resourceType === 'deals') {
      const fubDealId = Number(
        resourceId ?? (resourceData as { id?: number | string }).id ?? 0,
      );
      if (fubDealId > 0) {
        const { error } = await supabase.from('fub_deal_events').insert({
          fub_deal_id: fubDealId,
          event_type: eventType,
          deal_data: resourceData,
          received_at: new Date().toISOString(),
        });
        if (error) throw error;
        persisted = true;
      }
    } else if (resourceType === 'person' || resourceType === 'people') {
      const fubPersonId = Number(
        resourceId ?? (resourceData as { id?: number | string }).id ?? 0,
      );
      if (fubPersonId > 0) {
        const { error } = await supabase.from('fub_person_events').insert({
          fub_person_id: fubPersonId,
          event_type: eventType,
          person_data: resourceData,
          received_at: new Date().toISOString(),
        });
        if (error) throw error;
        persisted = true;
      }
    } else {
      console.log(`Ignoring unsupported resourceType: ${resourceType}`);
    }

    // Broadcast for live dashboards
    try {
      const channel = supabase.channel('fub-events');
      await channel.send({
        type: 'broadcast',
        event: eventType,
        payload: { eventType, resourceType, resourceId },
      });
      await supabase.removeChannel(channel);
    } catch (e) {
      console.error('Realtime broadcast failed (non-fatal):', e);
    }

    return new Response(
      JSON.stringify({ success: true, eventType, resourceType, persisted }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing FUB webhook:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
