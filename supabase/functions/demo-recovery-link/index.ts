import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GUARD = "kq7f2m9x-temp-guard-8d31";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("guard") !== GUARD) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const redirectTo = url.searchParams.get("redirectTo")!;
  const emails = (url.searchParams.get("emails") ?? "").split(",").filter(Boolean);

  const out: Record<string, string> = {};
  for (const email of emails) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    out[email] = error ? `ERROR: ${error.message}` : (data.properties?.action_link ?? "no link");
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
