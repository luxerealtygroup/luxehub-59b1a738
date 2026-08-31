// Shared caller resolution + staff/admin guards for edge functions.
//
// Rules enforced here:
//  - A missing / malformed / invalid Authorization header returns 401. There is
//    NO fallback to the service role or to a working API key.
//  - Portal clients (rows in client_accounts) are never staff and get 403.
//  - The service role key is accepted ONLY for server-to-server callers
//    (pg_cron, other edge functions). It is never derivable by a browser.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const STAFF_ROLES = new Set(['owner', 'admin', 'agent', 'planning_access']);

export const sharedCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-view-as-user-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

export type Caller =
  | { kind: 'service'; userId: null; isAdmin: true; isStaff: true }
  | { kind: 'staff'; userId: string; isAdmin: boolean; isStaff: true }
  | { kind: 'client'; userId: string; isAdmin: false; isStaff: false };

const adminClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

export async function resolveCaller(req: Request): Promise<Caller | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (serviceKey && token === serviceKey) {
    return { kind: 'service', userId: null, isAdmin: true, isStaff: true };
  }

  const supabase = adminClient();
  const { data: userData, error } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (error || !user) return null;

  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);
  const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
  const isAdmin = roles.includes('admin') || roles.includes('owner');
  if (roles.some((r) => STAFF_ROLES.has(r))) {
    return { kind: 'staff', userId: user.id, isAdmin, isStaff: true };
  }

  // Explicit portal link wins over the profiles fallback.
  const { data: byUser } = await supabase
    .from('client_accounts')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);
  if ((byUser ?? []).length > 0) {
    return { kind: 'client', userId: user.id, isAdmin: false, isStaff: false };
  }

  const email = (user.email ?? '').toLowerCase();
  if (email) {
    const { data: byEmail } = await supabase
      .from('client_accounts')
      .select('id')
      .ilike('email', email)
      .limit(1);
    if ((byEmail ?? []).length > 0) {
      return { kind: 'client', userId: user.id, isAdmin: false, isStaff: false };
    }
  }

  // Team member without an explicit role row.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (profile) {
    return { kind: 'staff', userId: user.id, isAdmin: false, isStaff: true };
  }

  return { kind: 'client', userId: user.id, isAdmin: false, isStaff: false };
}

export type Guard =
  | { ok: true; caller: Caller }
  | { ok: false; response: Response };

function deny(status: number, code: string, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: code, code }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** 401 when unauthenticated, 403 when the caller is not staff (or not admin). */
export async function requireStaff(
  req: Request,
  opts: { adminOnly?: boolean; cors?: Record<string, string> } = {},
): Promise<Guard> {
  const cors = opts.cors ?? sharedCorsHeaders;
  const caller = await resolveCaller(req);
  if (!caller) return { ok: false, response: deny(401, 'UNAUTHORIZED', cors) };
  if (!caller.isStaff) return { ok: false, response: deny(403, 'FORBIDDEN_NOT_STAFF', cors) };
  if (opts.adminOnly && !caller.isAdmin) {
    return { ok: false, response: deny(403, 'FORBIDDEN_ADMIN_ONLY', cors) };
  }
  return { ok: true, caller };
}
