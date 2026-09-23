import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ViewAsAgentContext } from '@/hooks/useViewAsAgent';

/**
 * Agent-side inbox of client portal conversations.
 *
 * Scoping is left entirely to the existing row-level policies on
 * client_accounts / portal_messages: the assigned agent, the portal's creator
 * and admin/operations see a portal, nobody else does. No policy is relaxed
 * and no new table is used — unread state reuses the notifications rows the
 * portal_messages trigger already writes.
 */
export interface Conversation {
  portalId: string;
  clientName: string;
  clientEmail: string;
  agentId: string | null;
  agentName: string;
  address: string | null;
  lastMessage: string | null;
  lastSender: string | null;
  lastSenderType: 'client' | 'agent' | 'ops' | null;
  lastAt: string | null;
  unread: number;
}

export function useAgentConversations() {
  const { user } = useAuth();
  const viewCtx = useContext(ViewAsAgentContext);
  const scopedUserId =
    viewCtx?.isViewingAsAgent && viewCtx.viewingAgentId ? viewCtx.viewingAgentId : user?.id ?? null;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!scopedUserId) return;
    setLoading(true);

    const { data: accounts } = await supabase
      .from('client_accounts')
      .select('id, full_name, email, assigned_agent_id, invited_by');

    const list = (accounts ?? []) as any[];
    const portalIds = list.map((a) => a.id as string);
    if (!portalIds.length) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const agentIds = Array.from(
      new Set(list.flatMap((a) => [a.assigned_agent_id, a.invited_by]).filter(Boolean)),
    ) as string[];

    const [msgsRes, propsRes, notifRes, profRes] = await Promise.all([
      supabase
        .from('portal_messages')
        .select('portal_id, message_body, sender_type, sender_name, created_at')
        .in('portal_id', portalIds)
        .order('created_at', { ascending: false }),
      supabase.from('portal_properties').select('portal_id, address').in('portal_id', portalIds),
      supabase
        .from('notifications')
        .select('portal_id')
        .eq('user_id', scopedUserId)
        .eq('type', 'message')
        .eq('is_read', false),
      agentIds.length
        ? supabase.from('profiles').select('id, full_name').in('id', agentIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const last = new Map<string, any>();
    (msgsRes.data ?? []).forEach((m: any) => {
      if (!last.has(m.portal_id)) last.set(m.portal_id, m);
    });
    const address = new Map<string, string>();
    (propsRes.data ?? []).forEach((p: any) => {
      if (p.address && !address.has(p.portal_id)) address.set(p.portal_id, p.address);
    });
    const unread = new Map<string, number>();
    (notifRes.data ?? []).forEach((n: any) => unread.set(n.portal_id, (unread.get(n.portal_id) ?? 0) + 1));
    const names = new Map<string, string>();
    (profRes.data ?? []).forEach((p: any) => names.set(p.id, p.full_name || 'Unknown'));

    const rows: Conversation[] = list
      .map((a) => {
        const m = last.get(a.id);
        const agentId = (a.assigned_agent_id || a.invited_by) as string | null;
        return {
          portalId: a.id as string,
          clientName: (a.full_name as string) || (a.email as string) || 'Client',
          clientEmail: (a.email as string) || '',
          agentId,
          agentName: agentId ? names.get(agentId) ?? 'Unassigned' : 'Unassigned',
          address: address.get(a.id) ?? null,
          lastMessage: m?.message_body ?? null,
          lastSender: m?.sender_name ?? null,
          lastSenderType: m?.sender_type ?? null,
          lastAt: m?.created_at ?? null,
          unread: unread.get(a.id) ?? 0,
        };
      })
      .sort((a, b) => {
        if (!a.lastAt && !b.lastAt) return a.clientName.localeCompare(b.clientName);
        if (!a.lastAt) return 1;
        if (!b.lastAt) return -1;
        return b.lastAt.localeCompare(a.lastAt);
      });

    setConversations(rows);
    setLoading(false);
  }, [scopedUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  // New client messages land in the list without a refresh.
  useEffect(() => {
    const channel = supabase
      .channel('agent-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portal_messages' }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unread, 0),
    [conversations],
  );

  return { conversations, totalUnread, loading, reload: load };
}

/** Unread client-message count for the nav badge. */
export function useUnreadMessageCount() {
  const { user } = useAuth();
  const viewCtx = useContext(ViewAsAgentContext);
  const scopedUserId =
    viewCtx?.isViewingAsAgent && viewCtx.viewingAgentId ? viewCtx.viewingAgentId : user?.id ?? null;
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!scopedUserId) return;
    const { count: c } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', scopedUserId)
      .eq('type', 'message')
      .eq('is_read', false);
    setCount(c ?? 0);
  }, [scopedUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!scopedUserId) return;
    const channel = supabase
      .channel(`inbox-badge-${scopedUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${scopedUserId}` },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [scopedUserId, load]);

  return count;
}
