import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function previousWeekISO(weekOf: string): string {
  const d = new Date(weekOf);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

function quarterOf(dateISO: string): { year: number; quarter: number; startISO: string; endISO: string } {
  const d = new Date(dateISO);
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(y, startMonth, 1));
  const end = new Date(Date.UTC(y, startMonth + 3, 0));
  return { year: y, quarter: q, startISO: start.toISOString().slice(0, 10), endISO: end.toISOString().slice(0, 10) };
}

const CLOSED_TOKENS = ["closed", "won", "sold", "settled", "completed"];
const PENDING_TOKENS = ["pending", "under contract", "conditional", "offer"];

function classifyFubStage(stageName: string): "closed" | "pending" | "other" {
  const s = (stageName || "").toLowerCase();
  if (CLOSED_TOKENS.some((t) => s.includes(t))) return "closed";
  if (PENDING_TOKENS.some((t) => s.includes(t))) return "pending";
  return "other";
}

function isConditional(stageName: string): boolean {
  const s = (stageName || "").toLowerCase();
  return s.includes("conditional") || s.includes("offer");
}

function dealBelongsToAgent(deal: any, fubUserId: number | null): boolean {
  if (!fubUserId) return false;
  const users = Array.isArray(deal?.users) ? deal.users : [];
  return users.some((u: any) => Number(u?.id) === Number(fubUserId));
}

function dealCloseDate(deal: any): string | null {
  return deal?.projectedCloseDate || deal?.closedDate || deal?.createdAt || null;
}

function inQuarter(dateStr: string | null, startISO: string, endISO: string): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= startISO && d <= endISO;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { agent_id, week_of, transcript_text } = await req.json();
    if (!agent_id || !week_of || !transcript_text) {
      return new Response(JSON.stringify({ error: "agent_id, week_of, transcript_text required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const previousWeek = previousWeekISO(week_of);
    const q = quarterOf(week_of);

    const [profileRes, thisWeekGoalsRes, previousWeekGoalsRes, annualGoalsRes, pipelineClientsRes, gapRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, coaching_history_seed, signature_emoji, fub_user_id, fub_account").eq("id", agent_id).maybeSingle(),
      supabase.from("agent_goals").select("*").eq("user_id", agent_id).eq("start_date", week_of),
      supabase.from("agent_goals").select("*").eq("user_id", agent_id).eq("start_date", previousWeek),
      supabase.from("agent_goals").select("*").eq("user_id", agent_id).in("period", ["annual", "quarterly", "q1", "q2", "q3", "q4", "yearly"]),
      supabase.from("pipeline_clients").select("id, stage, client_type, deal_category, projected_sale_amount, projected_gci, expected_pending_date, status").eq("user_id", agent_id),
      supabase.from("pipeline_gap_settings").select("*").eq("user_id", agent_id).eq("year", q.year).eq("quarter", q.quarter).maybeSingle(),
    ]);

    if (profileRes.error) throw profileRes.error;
    const profile = profileRes.data;
    if (!profile) throw new Error("Agent profile not found");

    // Fetch FUB deals for this agent via the follow-up-boss edge function,
    // then filter to deals where the agent is one of the assigned FUB users.
    let fubDealsForAgent: any[] = [];
    let fubFetchError: string | null = null;
    try {
      // Guard: if another profile shares this FUB user id, the deal filter would
      // attribute someone else's book of business to this agent. Skip FUB deals.
      let sharedMapping = false;
      if (profile.fub_user_id) {
        const { data: dupes } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("fub_user_id", profile.fub_user_id)
          .eq("fub_account", profile.fub_account ?? "primary");
        if ((dupes ?? []).length > 1) {
          sharedMapping = true;
          fubFetchError = `Follow Up Boss user id ${profile.fub_user_id} is mapped to more than one profile (${(dupes ?? []).map((d: any) => d.full_name).join(", ")}). Deal data was excluded to avoid attributing another agent's deals.`;
          console.error(fubFetchError);
        }
      }
      if (sharedMapping) throw new Error("SKIP_FUB");
      const fubRes = await supabase.functions.invoke("follow-up-boss", {
        body: { action: "get_deals", params: { all: true, limit: 100 } },
        headers: { "x-view-as-user-id": agent_id },
      });
      const payload: any = fubRes.data;
      const allDeals: any[] = payload?.data?.deals ?? [];
      if (profile.fub_user_id) {
        fubDealsForAgent = allDeals.filter((d) => dealBelongsToAgent(d, profile.fub_user_id));
      } else {
        fubFetchError = "Agent has no fub_user_id set on profile.";
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== "SKIP_FUB") {
        fubFetchError = msg;
        console.error("FUB fetch failed:", fubFetchError);
      }
      fubDealsForAgent = [];
    }

    const closedDeals = fubDealsForAgent.filter((d) => classifyFubStage(d.stageName) === "closed");
    const pendingDeals = fubDealsForAgent.filter((d) => classifyFubStage(d.stageName) === "pending");
    const conditionalDeals = pendingDeals.filter((d) => isConditional(d.stageName));
    const firmPendingDeals = pendingDeals.filter((d) => !isConditional(d.stageName));

    const qClosed = closedDeals.filter((d) => inQuarter(dealCloseDate(d), q.startISO, q.endISO));
    const qConditional = conditionalDeals.filter((d) => inQuarter(dealCloseDate(d), q.startISO, q.endISO));
    const qFirmPending = firmPendingDeals.filter((d) => inQuarter(dealCloseDate(d), q.startISO, q.endISO));
    const qRunningTotalUnits = qClosed.length + qConditional.length + qFirmPending.length;

    const gciSum = (arr: any[]) => arr.reduce((s, d) => s + (Number(d?.commissionValue ?? d?.agentCommission ?? 0) || 0), 0);

    const pipelineClients = pipelineClientsRes.data ?? [];
    const activePipelineCount = pipelineClients.filter((c: any) => Number(c.stage) < 9).length;

    const quarterlyGoal = (gapRes as any).data?.quarterly_goal ?? null;
    const falloutRate = (gapRes as any).data?.fallout_rate ?? null;

    const context = {
      agent: {
        name: profile.full_name,
        signature_emoji: profile.signature_emoji ?? "💜",
        coaching_history_seed: profile.coaching_history_seed ?? null,
        fub_user_id: profile.fub_user_id ?? null,
      },
      week_of,
      current_quarter: { year: q.year, quarter: q.quarter, start: q.startISO, end: q.endISO },
      this_week_targets: thisWeekGoalsRes.data ?? [],
      previous_week_targets: previousWeekGoalsRes.data ?? [],
      annual_and_quarterly_goals: annualGoalsRes.data ?? [],
      quarterly_gap_setting: {
        quarterly_goal: quarterlyGoal,
        fallout_rate: falloutRate,
      },
      pipeline: {
        source: "follow_up_boss",
        fub_fetch_error: fubFetchError,
        active_pipeline_count_local: activePipelineCount,
        total_fub_deals_for_agent: fubDealsForAgent.length,
        firm_closed_count: closedDeals.length,
        firm_closed_gci: gciSum(closedDeals),
        conditional_count: conditionalDeals.length,
        conditional_gci: gciSum(conditionalDeals),
        firm_pending_count: firmPendingDeals.length,
        firm_pending_gci: gciSum(firmPendingDeals),
        total_secured_count: closedDeals.length + conditionalDeals.length + firmPendingDeals.length,
        current_quarter_running_total_units: qRunningTotalUnits,
        current_quarter_closed_count: qClosed.length,
        current_quarter_conditional_count: qConditional.length,
        current_quarter_firm_pending_count: qFirmPending.length,
        deals_sample: fubDealsForAgent.slice(0, 40).map((d) => ({
          id: d.id,
          name: d.name,
          stage: d.stageName,
          pipeline: d.pipelineName,
          price: d.price,
          commissionValue: d.commissionValue,
          projectedCloseDate: d.projectedCloseDate,
          status: d.status,
        })),
      },
      transcript_text,
    };

    const systemPrompt = `You are a direct, warm-but-firm real estate performance coach writing a weekly coaching note for an agent. Write in second person when addressing the agent. Be honest about misses, specific about numbers (use ONLY the numbers provided — do not estimate), and concrete about next actions.

Data mapping:
- "this_week_targets" in the context = the current week's goals. Use these for the 🎯 Non-Negotiables section.
- "previous_week_targets" in the context = the previous week's goals. Use these for the ✅ Last Week section to compare against the agent's actual performance discussed in the transcript.
- "pipeline.firm_closed_count" = deals closed/won/sold (source: Follow Up Boss). Use for "Firm closed".
- "pipeline.conditional_count" = deals in conditional/offer stages (source: FUB). Use for "Conditional".
- "pipeline.firm_pending_count" = pending/under-contract deals that are not still on offer.
- "pipeline.total_secured_count" = firm_closed + conditional + firm_pending. Use for "Total secured".
- "quarterly_gap_setting.quarterly_goal" = the agent's goal for the current quarter (source: pipeline_gap_settings). Use for "Q3 goal" (or whichever quarter current_quarter.quarter is).
- "pipeline.current_quarter_running_total_units" = firm_closed + conditional + firm_pending whose close date lands in the current quarter. Use for "Q3 pipeline running total".
- "annual_and_quarterly_goals" contains agent_goals rows; use the row where goal_type="gci" and period IN ("annual","yearly") for "Annual goal".
- If pipeline.fub_fetch_error is non-null, say the pipeline numbers could not be pulled from Follow Up Boss and skip the pipeline math block rather than fabricating numbers.

Output the note in this EXACT structure, using the emojis and section headers verbatim:

[signature_emoji] [Agent Name] — Week of [date] | [one-line hook summarizing the key situation this week]

✅ Last Week — Progress Where It Counted
[bullet list of last week's stats vs. previous_week_targets — use ✅ for hits, and honestly name misses. Compare the actual numbers discussed in the transcript to the previous week's targets.]

📍 The Truth
[2-4 sentence honest reflection paragraph on last week]

[Pipeline math block with these exact labels on their own lines:
Annual goal: X
Firm closed: X
Conditional: X
Total secured: X
Q3 goal: X
Q3 pipeline running total: X
Then a gap-analysis paragraph interpreting these numbers.]

🎯 Non-Negotiables
[checklist using ☐ for each of this_week_targets with a short one-line rationale. These are the current week's goals.]

⚠️ Things To Watch
[for each named risk/opportunity/person mentioned in the transcript, a **bolded mini-header** followed by a short paragraph]

📅 This Week
[day-by-day Mon-Sun. Each day starts with a colored circle emoji (🟢🟡🔵🟠🔴⚪⚫) and a short focus. Infer schedule from transcript.]

🔥 Bottom Line
[summary paragraph tying the week together]

[One motivational tagline line — short checklist-style phrases separated by periods.]

Go get it [Agent Name] [signature_emoji]`;

    const userMessage = `Generate the coaching note using this data. Only use provided numbers.

CONTEXT JSON:
${JSON.stringify(context, null, 2)}

TRANSCRIPT (this week's coaching conversation):
${transcript_text}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("Anthropic error:", aiRes.status, t);
      throw new Error(`Anthropic ${aiRes.status}`);
    }

    const aiJson = await aiRes.json();
    const generatedNotes: string = aiJson?.content?.[0]?.text ?? "";

    const { data: session, error: upsertErr } = await supabase
      .from("coaching_sessions")
      .upsert(
        { agent_id, week_of, transcript_text, generated_notes: generatedNotes },
        { onConflict: "agent_id,week_of" },
      )
      .select()
      .maybeSingle();

    if (upsertErr) {
      // Fallback: insert if no unique constraint present
      const { data: inserted, error: insertErr } = await supabase
        .from("coaching_sessions")
        .insert({ agent_id, week_of, transcript_text, generated_notes: generatedNotes })
        .select()
        .maybeSingle();
      if (insertErr) throw insertErr;
      return new Response(JSON.stringify({ session: inserted, generated_notes: generatedNotes }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ session, generated_notes: generatedNotes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-coaching-notes error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});