import { supabase } from '@/integrations/supabase/client';
import { tenant } from '@/config/tenant';

export interface AgentOptionRow {
  id: string;
  full_name: string;
  email: string;
  member_type: string;
}

/**
 * The one list every "pick an agent" dropdown uses.
 * Filtered server-side (list_agent_options): active agent / admin / operations
 * accounts in the caller's brokerage that hold a team role. Never clients,
 * system/test accounts, removed or expired logins. The sample demo agent is
 * included only while demo mode is switched on.
 */
export async function fetchAgentOptions(): Promise<AgentOptionRow[]> {
  let demo = false;
  try {
    demo = window.localStorage.getItem(`${tenant.storagePrefix}_demo_mode`) === '1';
  } catch {}
  const { data, error } = await (supabase.rpc as any)('list_agent_options', { _include_demo: demo });
  if (error) {
    console.error('list_agent_options failed', error);
    return [];
  }
  return ((data as any[]) ?? []).map((r) => ({
    id: r.id,
    full_name: r.full_name ?? r.email ?? '',
    email: r.email ?? '',
    member_type: r.member_type ?? '',
  }));
}
