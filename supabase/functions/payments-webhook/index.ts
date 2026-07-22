import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, verifyWebhook, createStripeClient } from "../_shared/stripe.ts";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _supabase;
}

// Map human-readable price id → org tier
function tierForPrice(priceLookupKey: string | null | undefined): 'pro' | 'team' | null {
  if (!priceLookupKey) return null;
  if (priceLookupKey === 'pro_monthly') return 'pro';
  if (priceLookupKey === 'team_monthly') return 'team';
  return null;
}

function priceIdFromItem(item: any): string | null {
  return item?.price?.lookup_key
    || item?.price?.metadata?.lovable_external_id
    || item?.price?.id
    || null;
}

// Resolve org_id from a subscription: check subscription metadata, then Customer metadata.
async function resolveOrgId(subscription: any, env: StripeEnv): Promise<string | null> {
  const fromSub = subscription.metadata?.orgId || subscription.metadata?.org_id;
  if (fromSub) return fromSub;

  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;
  if (!customerId) return null;

  try {
    const stripe = createStripeClient(env);
    const customer = await stripe.customers.retrieve(customerId) as any;
    return customer?.metadata?.orgId || customer?.metadata?.org_id || null;
  } catch (e) {
    console.error('resolveOrgId: failed to retrieve customer', e);
    return null;
  }
}

async function upsertOrgFromSubscription(subscription: any, env: StripeEnv) {
  const orgId = await resolveOrgId(subscription, env);
  if (!orgId) {
    console.error('payments-webhook: no orgId on subscription or customer', subscription.id);
    return;
  }

  const item = subscription.items?.data?.[0];
  const priceLookup = priceIdFromItem(item);
  const tier = tierForPrice(priceLookup);
  const status: string = subscription.status;
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  // Only upgrade tier when subscription is healthy. Never downgrade tier here —
  // caller instructed grace-period logic will be handled separately.
  const shouldSetTier = tier && ['active', 'trialing', 'past_due'].includes(status);

  const patch: Record<string, any> = {
    stripe_customer_id: customerId ?? null,
    stripe_subscription_id: subscription.id,
    subscription_status: status,
  };
  if (shouldSetTier) patch.tier = tier;

  const { error } = await getSupabase()
    .from('organizations')
    .update(patch)
    .eq('id', orgId);

  if (error) console.error('payments-webhook: org update failed', error);
  else console.log('payments-webhook: updated org', orgId, patch);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  console.log('payments-webhook event:', event.type);

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await upsertOrgFromSubscription(event.data.object, env);
      break;
    default:
      console.log('payments-webhook: unhandled event', event.type);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const rawEnv = new URL(req.url).searchParams.get('env');
  if (rawEnv !== 'sandbox' && rawEnv !== 'live') {
    console.error('payments-webhook: invalid env', rawEnv);
    return new Response(JSON.stringify({ received: true, ignored: 'invalid env' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await handleWebhook(req, rawEnv as StripeEnv);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('payments-webhook error:', e);
    return new Response('Webhook error', { status: 400 });
  }
});