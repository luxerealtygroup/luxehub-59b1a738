import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface NotificationRow {
  id: string;
  user_id: string;
  portal_id: string;
  message_id: string | null;
  client_name: string | null;
  message_preview: string | null;
  is_read: boolean;
  created_at: string;
  client_accounts?: {
    email: string;
    full_name: string | null;
    fub_person_id: number | null;
    client_type: string | null;
  } | null;
}

export function useNotifications(limit = 50) {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*, client_accounts:portal_id(email, full_name, fub_person_id, client_type)')
      .order('created_at', { ascending: false })
      .limit(limit);
    setItems((data as NotificationRow[]) ?? []);
    setLoading(false);
  }, [user, limit]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => {
          fetchAll();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchAll]);

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllRead = async () => {
    const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
  };

  const unreadCount = items.filter((n) => !n.is_read).length;

  return { items, loading, unreadCount, markRead, markAllRead, refetch: fetchAll };
}