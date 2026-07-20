import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data, error } = await admin.auth.admin.updateUserById(
    "53b3385f-45db-418a-b132-70af49ac9db0",
    { password: "Luxe123!" }
  );
  return new Response(JSON.stringify({ ok: !error, error: error?.message, id: data?.user?.id }), {
    headers: { "Content-Type": "application/json" },
  });
});