import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await req.json();
    if (!userId) throw new Error("userId required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const currentYear = new Date().getFullYear();
    const today = new Date().toISOString().split("T")[0];
    const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);

    // Fetch mindset reflection data
    const { data: mindset } = await supabase
      .from("business_planning_reflections")
      .select("*")
      .eq("user_id", userId)
      .eq("year", currentYear)
      .eq("quarter", currentQuarter)
      .maybeSingle();

    // Fetch all weekly_411 rows for this agent YTD
    const { data: weeks, error } = await supabase
      .from("weekly_411")
      .select("*")
      .eq("user_id", userId)
      .gte("week_start_date", `${currentYear}-01-01`)
      .lte("week_start_date", today)
      .order("week_start_date", { ascending: true });

    if (error) throw error;
    if (!weeks || weeks.length === 0) {
      return new Response(JSON.stringify({ error: "No 4-1-1 data found YTD." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Aggregate priorities as "tasks"
    const tasks: { title: string; status: "completed" | "incomplete"; week: string }[] = [];
    for (const w of weeks) {
      for (let i = 1; i <= 4; i++) {
        const title = w[`priority_${i}` as keyof typeof w] as string | null;
        const completed = w[`priority_${i}_completed` as keyof typeof w] as boolean | null;
        if (title && title.trim()) {
          tasks.push({ title: title.trim(), status: completed ? "completed" : "incomplete", week: w.week_start_date });
        }
      }
      for (let i = 1; i <= 3; i++) {
        const title = w[`personal_priority_${i}` as keyof typeof w] as string | null;
        const completed = w[`personal_priority_${i}_completed` as keyof typeof w] as boolean | null;
        if (title && title.trim()) {
          tasks.push({ title: title.trim(), status: completed ? "completed" : "incomplete", week: w.week_start_date });
        }
      }
    }

    // Aggregate activity metrics with goal-tracking fallback
    const totalWeeks = weeks.length;
    const val = (v: number | null | undefined): number => v || 0;
    const totals = {
      dials: 0, contacts: 0, appointmentsSet: 0, appointmentsHeld: 0,
      pipelineAdditions: 0, contractsSigned: 0, firmDeals: 0, doorsKnocked: 0,
    };
    for (const w of weeks) {
      // Use activity fields first; fall back to goal tracking fields if activity is 0/null
      totals.dials += val(w.dials) || val(w.calls_actual);
      totals.contacts += val(w.contacts_made);
      totals.appointmentsSet += val(w.appointments_set) || val(w.appointments_actual);
      totals.appointmentsHeld += val(w.appointments_held) || val(w.appointments_actual);
      totals.pipelineAdditions += val(w.pipeline_additions);
      totals.contractsSigned += val(w.contracts_signed) || val(w.contracts_actual);
      totals.firmDeals += val(w.firm_deals);
      totals.doorsKnocked += val(w.doors_knocked);
    }

    // Count task completion patterns
    const taskCompletionMap: Record<string, { completed: number; incomplete: number }> = {};
    for (const t of tasks) {
      const key = t.title.toLowerCase();
      if (!taskCompletionMap[key]) taskCompletionMap[key] = { completed: 0, incomplete: 0 };
      taskCompletionMap[key][t.status]++;
    }

    const completedCount = tasks.filter(t => t.status === "completed").length;
    const incompleteCount = tasks.filter(t => t.status === "incomplete").length;
    const totalTasks = tasks.length;

    // Top completed and incomplete task types
    const sortedTasks = Object.entries(taskCompletionMap)
      .map(([title, counts]) => ({ title, ...counts, total: counts.completed + counts.incomplete }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    // Build mindset context
    let mindsetBlock = "";
    if (mindset) {
      mindsetBlock = `
AGENT MINDSET (Q${currentQuarter} Self-Assessment):
- Confidence Level: ${mindset.confidence ?? "N/A"}/10
- Stress Level: ${mindset.stress ?? "N/A"}/10
- Wins YTD: ${mindset.wins_ytd || "Not provided"}
- Biggest Bottleneck: ${mindset.biggest_bottleneck || "Not provided"}
- What They're Avoiding: ${mindset.what_avoiding || "Not provided"}
`;
    }

    const prompt = `You are a supportive yet direct real estate performance coach. Analyze this agent's YTD Weekly 4-1-1 data AND their mindset self-assessment to generate a performance reflection that is encouraging and constructive.

DATA SUMMARY (${totalWeeks} weeks tracked in ${currentYear}):

ACTIVITY TOTALS:
- Total Dials: ${totals.dials} (avg ${Math.round(totals.dials / totalWeeks)}/week)
- Total Contacts: ${totals.contacts} (avg ${Math.round(totals.contacts / totalWeeks)}/week)
- Appointments Set: ${totals.appointmentsSet} (avg ${Math.round(totals.appointmentsSet / totalWeeks)}/week)
- Appointments Held: ${totals.appointmentsHeld} (avg ${Math.round(totals.appointmentsHeld / totalWeeks)}/week)
- Pipeline Additions: ${totals.pipelineAdditions}
- Contracts Signed: ${totals.contractsSigned}
- Firm Deals: ${totals.firmDeals}
- Doors Knocked: ${totals.doorsKnocked}

PRIORITY TASK COMPLETION:
- Total Priorities Set: ${totalTasks}
- Completed: ${completedCount} (${totalTasks > 0 ? Math.round(completedCount / totalTasks * 100) : 0}%)
- Incomplete: ${incompleteCount}

TOP RECURRING PRIORITIES:
${sortedTasks.map(t => `- "${t.title}": ${t.completed} completed, ${t.incomplete} incomplete`).join("\n")}
${mindsetBlock}
Rules:
- Lead with positive reinforcement — acknowledge wins, effort, and consistency before addressing gaps
- Use actual numbers from the data
- If stress is high (7+), recommend specific wellness strategies: meditation, breathwork exercises, journaling prompts, morning routines, or mindfulness practices
- If confidence is low (<5), focus on celebrating small wins and building momentum
- If they identified a bottleneck or avoidance pattern, address it with empathy and a concrete micro-step
- In strategic suggestions, include at least one mindset/wellness recommendation alongside business tactics
- Keep each section concise but warm`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: "Generate the 4-section performance reflection." },
        ],
        tools: [{
          type: "function",
          function: {
            name: "provide_reflection",
            description: "Return a structured YTD performance reflection",
            parameters: {
              type: "object",
              properties: {
                performance_summary: { type: "string", description: "1-2 paragraph YTD performance summary" },
                strengths: { type: "array", items: { type: "string" }, description: "3-5 strength bullet points" },
                growth_opportunities: { type: "array", items: { type: "string" }, description: "3-5 growth opportunity bullet points" },
                strategic_suggestions: { type: "array", items: { type: "string" }, description: "3-5 actionable Q suggestions" },
              },
              required: ["performance_summary", "strengths", "growth_opportunities", "strategic_suggestions"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "provide_reflection" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", status, t);
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("reflection-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
