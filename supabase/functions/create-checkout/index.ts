import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  priceIds: z.array(z.string().min(1)).min(1).max(10),
  customerEmail: z.string().email().optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  orgId: z.string().uuid(),
  returnUrl: z.string().url(),
  environment: z.enum(["sandbox", "live"]),
});

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string | null; userId?: string | null; orgId?: string | null },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }

  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }

  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      const newMetadata = {
        ...customer.metadata,
        ...(options.userId && { userId: options.userId }),
        ...(options.orgId && { orgId: options.orgId }),
      };
      if (
        (options.userId && customer.metadata?.userId !== options.userId) ||
        (options.orgId && customer.metadata?.orgId !== options.orgId)
      ) {
        await stripe.customers.update(customer.id, { metadata: newMetadata });
      }
      return customer.id;
    }
  }

  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    metadata: {
      ...(options.userId && { userId: options.userId }),
      ...(options.orgId && { orgId: options.orgId }),
    },
  });
  return created.id;
}

async function createCheckoutSession(options: {
  priceIds: string[];
  customerEmail?: string | null;
  userId?: string | null;
  orgId: string;
  returnUrl: string;
  environment: StripeEnv;
}) {
  const stripe = createStripeClient(options.environment);

  const prices = await Promise.all(
    options.priceIds.map(async (priceId) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(priceId)) throw new Error("Invalid priceId");
      const list = await stripe.prices.list({ lookup_keys: [priceId], limit: 1 });
      if (!list.data.length) throw new Error(`Price not found: ${priceId}`);
      return list.data[0];
    }),
  );

  const isRecurring = prices.some((p) => p.type === "recurring");

  const customerId = await resolveOrCreateCustomer(stripe, {
    email: options.customerEmail,
    userId: options.userId,
    orgId: options.orgId,
  });

  const lineItems = prices.map((price) => ({ price: price.id, quantity: 1 }));

  const session = await stripe.checkout.sessions.create({
    line_items: lineItems,
    mode: isRecurring ? "subscription" : "payment",
    ui_mode: "embedded_page",
    return_url: options.returnUrl,
    customer: customerId,
    metadata: {
      ...(options.userId && { userId: options.userId }),
      orgId: options.orgId,
    },
    ...(isRecurring && {
      subscription_data: {
        metadata: {
          ...(options.userId && { userId: options.userId }),
          orgId: options.orgId,
        },
      },
    }),
  });

  return session.client_secret;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { priceIds, customerEmail, userId, orgId, returnUrl, environment } = parsed.data;
    const clientSecret = await createCheckoutSession({
      priceIds,
      customerEmail,
      userId,
      orgId,
      returnUrl,
      environment,
    });

    return new Response(JSON.stringify({ clientSecret }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("create-checkout error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
