import { createStripeClient } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  try {
    const { env = 'sandbox', action } = await req.json();
    const stripe = createStripeClient(env);
    if (action === 'list') {
      const products = await stripe.products.list({ limit: 100, active: true });
      const out: any[] = [];
      for (const p of products.data) {
        const prices = await stripe.prices.list({ product: p.id, limit: 100, active: true });
        out.push({
          id: p.id,
          name: p.name,
          prices: prices.data.map(pr => ({
            id: pr.id,
            lookup_key: pr.lookup_key,
            currency: pr.currency,
            unit_amount: pr.unit_amount,
            recurring: pr.recurring?.interval ?? null,
            active: pr.active,
          })),
        });
      }
      return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500 });
  }
});