import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-fub-signature, fub-signature',
};

const WEBHOOK_SECRET = Deno.env.get('FUB_WEBHOOK_SECRET');

/**
 * FUB signs webhook bodies with HMAC-SHA1 using the developer-system key.
 * Header is `FUB-Signature` (hex digest). We accept the lowercased variant too.
 */
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!WEBHOOK_SECRET || !signatureHeader) return false;
  try {
    const expected = createHmac('sha1', WEBHOOK_SECRET).update(rawBody).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signatureHeader.trim(), 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch (e) {
    console.error('Signature verification error:', e);
    return false;
  }
}

function extractResourceIds(payload: Record<string, unknown>): unknown {
  // FUB shapes vary. Try common locations.
  const data = payload.data as Record<string, unknown> | undefined;
  return (
    payload.resourceIds ??
    data?.ids ??
    data?.id ??
    (typeof data === 'object' && data !== null && 'id' in data ? data.id : null)
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const signatureHeader =
      req.headers.get('fub-signature') ?? req.headers.get('x-fub-signature');
    const signatureValid = verifySignature(rawBody, signatureHeader);

    // If a secret is configured, reject invalid signatures.
    // If no secret is configured yet, accept but flag (signature_valid=false).
    if (WEBHOOK_SECRET && !signatureValid) {
      console.warn('FUB webhook rejected: invalid signature');
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!WEBHOOK_SECRET) {
      console.warn(
        'FUB_WEBHOOK_SECRET is not set — accepting unverified webhook. Set the secret to enable signature enforcement.'
      );
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch (e) {
      console.error('Invalid JSON body:', e);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const eventType =
      (payload.event as string | undefined) ??
      (payload.eventCreated as string | undefined) ??
      'unknown';
    const resourceIds = extractResourceIds(payload);

    console.log(`FUB webhook: event=${eventType}, signatureValid=${signatureValid}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Persist the event (acts as a sync log)
    const { data: inserted, error: insertError } = await supabase
      .from('fub_webhook_events')
      .insert({
        event_type: eventType,
        resource_ids: resourceIds == null ? null : (resourceIds as object),
        payload,
        signature_valid: signatureValid,
      })
      .select('id, received_at')
      .single();

    if (insertError) {
      console.error('Failed to persist webhook event:', insertError);
    }

    // Broadcast on a shared channel so connected dashboards can invalidate caches
    try {
      const channel = supabase.channel('fub-events');
      await channel.send({
        type: 'broadcast',
        event: eventType,
        payload: {
          id: inserted?.id ?? null,
          eventType,
          resourceIds,
          receivedAt: inserted?.received_at ?? new Date().toISOString(),
        },
      });
      await supabase.removeChannel(channel);
    } catch (e) {
      console.error('Realtime broadcast failed (non-fatal):', e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        eventType,
        persisted: !!inserted,
        signatureValid,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
