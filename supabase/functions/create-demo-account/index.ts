import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, srv);

    const email = "kyrsten@kyrstenfeere.com";
    const tempPassword = "DemoLuxe2026!";
    const fullName = "Demo Admin (Example)";

    // Create or fetch user
    let userId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createErr) {
      // Likely already exists — find them
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (!existing) throw createErr;
      userId = existing.id;
      // Reset password so they can log in
      await admin.auth.admin.updateUserById(userId, { password: tempPassword, email_confirm: true });
    } else {
      userId = created.user.id;
    }

    // Ensure profile exists with the demo name (no FUB id so they don't see real data)
    await admin.from("profiles").upsert({ id: userId, full_name: fullName, fub_user_id: null });

    // Ensure admin role
    await admin.from("user_roles").upsert(
      { user_id: userId, role: "admin" },
      { onConflict: "user_id,role" }
    );

    // ---- Seed dummy data (idempotent: clear prior demo rows first) ----
    await admin.from("commissions").delete().eq("user_id", userId);
    await admin.from("deals").delete().eq("user_id", userId);
    await admin.from("pipeline_clients").delete().eq("user_id", userId);
    await admin.from("agent_goals").delete().eq("user_id", userId);
    await admin.from("manual_production").delete().eq("user_id", userId);

    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;

    // Deals (closed + pending + offer)
    const deals = [
      { user_id: userId, client_name: "Sample Buyer — Anders", property_address: "12 Maple Cres, Demo City", deal_value: 875000, stage: "closed", commission_rate: 2.5, expected_close_date: `${year}-0${Math.max(1, month - 1)}-15`.slice(0, 10) },
      { user_id: userId, client_name: "Sample Seller — Brooks", property_address: "204 Oak Ave, Demo City", deal_value: 1250000, stage: "closed", commission_rate: 2.5, expected_close_date: `${year}-0${Math.max(1, month - 1)}-22`.slice(0, 10) },
      { user_id: userId, client_name: "Sample Buyer — Chen", property_address: "88 Cedar Way, Demo City", deal_value: 690000, stage: "pending", commission_rate: 2.5 },
      { user_id: userId, client_name: "Sample Seller — Davies", property_address: "47 Birch Rd, Demo City", deal_value: 1450000, stage: "pending", commission_rate: 2.5 },
      { user_id: userId, client_name: "Sample Buyer — Evans", property_address: "9 Pine Lane, Demo City", deal_value: 815000, stage: "offer", commission_rate: 2.5 },
    ];
    const { data: insertedDeals } = await admin.from("deals").insert(deals).select();

    // Commissions for the closed deals
    if (insertedDeals) {
      const commRows = insertedDeals
        .filter((d) => d.stage === "closed")
        .map((d) => ({
          user_id: userId!,
          deal_id: d.id,
          gross_commission: Number(d.deal_value) * 0.025,
          amount: Number(d.deal_value) * 0.025 * 0.7,
          agent_split_percent: 70,
          brokerage_split_percent: 30,
          status: "paid",
          paid_at: new Date().toISOString(),
          transaction_side: "buyer",
        }));
      if (commRows.length) await admin.from("commissions").insert(commRows);

      const pendingComm = insertedDeals
        .filter((d) => d.stage === "pending")
        .map((d) => ({
          user_id: userId!,
          deal_id: d.id,
          gross_commission: Number(d.deal_value) * 0.025,
          amount: Number(d.deal_value) * 0.025 * 0.7,
          agent_split_percent: 70,
          brokerage_split_percent: 30,
          status: "pending",
          transaction_side: "seller",
        }));
      if (pendingComm.length) await admin.from("commissions").insert(pendingComm);
    }

    // Pipeline clients
    await admin.from("pipeline_clients").insert([
      { user_id: userId, client_name: "Pipeline — Foster", client_type: "buyer", stage: 4, projected_sale_amount: 720000, projected_gci: 18000, deal_category: "sale", source: "Referral" },
      { user_id: userId, client_name: "Pipeline — Garcia", client_type: "seller", stage: 3, projected_sale_amount: 1100000, projected_gci: 27500, deal_category: "sale", source: "Sphere" },
      { user_id: userId, client_name: "Pipeline — Hayes", client_type: "buyer", stage: 2, projected_sale_amount: 560000, projected_gci: 14000, deal_category: "sale", source: "Online" },
    ]);

    // Goal
    await admin.from("agent_goals").insert({
      user_id: userId,
      goal_type: "gci",
      target_value: 250000,
      current_value: 65000,
      period: "annual",
      category: "business",
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
    });

    // Manual production snapshot
    await admin.from("manual_production").insert({
      user_id: userId,
      year,
      month,
      closed_deals: 2,
      pending_deals: 2,
      gci_closed: 53125,
      gci_pending: 38000,
      total_volume: 2125000,
      database_size: 250,
      pipeline_count: 3,
      notes: "Demo account — sample data only",
    });

    return new Response(
      JSON.stringify({ success: true, email, password: tempPassword, user_id: userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});