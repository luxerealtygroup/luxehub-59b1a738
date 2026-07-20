import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Headset, User, Sparkles, ShieldCheck, Send, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type TicketStatus = 'ai_active' | 'escalated' | 'in_progress' | 'resolved' | 'closed';

interface Ticket {
  id: string;
  user_id: string;
  user_email: string;
  user_type: 'realtor' | 'client';
  subject: string | null;
  status: TicketStatus;
  priority: string;
  context_route: string | null;
  assigned_admin_id: string | null;
  escalation_reason: string | null;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  ticket_id: string;
  sender_type: 'user' | 'ai' | 'admin' | 'system';
  content: string;
  created_at: string;
}

const statusStyles: Record<TicketStatus, string> = {
  ai_active: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  escalated: 'bg-red-500/10 text-red-600 border-red-500/30',
  in_progress: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  resolved: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  closed: 'bg-muted text-muted-foreground border-border',
};

const statusLabels: Record<TicketStatus, string> = {
  ai_active: 'AI Active',
  escalated: 'Escalated',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default function AdminTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | TicketStatus>('open');
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadTickets();

    const channel = supabase
      .channel('admin-support-tickets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_tickets' },
        () => loadTickets(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadTickets = async () => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (!error) setTickets((data as Ticket[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', selectedId)
        .order('created_at', { ascending: true });
      if (!cancelled) setMessages((data as Message[]) || []);
    })();

    const channel = supabase
      .channel(`admin-support-messages-${selectedId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
          filter: `ticket_id=eq.${selectedId}`,
        },
        (payload) => {
          setMessages((prev) => {
            const next = payload.new as Message;
            if (prev.some((m) => m.id === next.id)) return prev;
            return [...prev, next];
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [selectedId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter === 'open') {
        if (t.status === 'resolved' || t.status === 'closed') return false;
      } else if (statusFilter !== 'all' && t.status !== statusFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          t.user_email.toLowerCase().includes(q) ||
          (t.subject ?? '').toLowerCase().includes(q) ||
          (t.escalation_reason ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [tickets, statusFilter, search]);

  const selectedTicket = tickets.find((t) => t.id === selectedId);

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = reply.trim();
    if (!body || !selectedTicket || sending) return;
    setSending(true);
    const { data: sess } = await supabase.auth.getUser();
    const userId = sess.user?.id;

    const { error } = await supabase.from('support_messages').insert({
      ticket_id: selectedTicket.id,
      sender_type: 'admin',
      sender_user_id: userId,
      content: body,
    });

    if (error) {
      toast({ title: 'Reply failed', description: error.message, variant: 'destructive' });
    } else {
      setReply('');
      // Move to in_progress on first admin reply
      if (selectedTicket.status === 'escalated') {
        await supabase
          .from('support_tickets')
          .update({ status: 'in_progress' })
          .eq('id', selectedTicket.id);
      }
      // Notify user
      await supabase.from('notifications').insert({
        user_id: selectedTicket.user_id,
        client_name: 'LUXE Support',
        message_preview: body.slice(0, 100),
      });
    }
    setSending(false);
  };

  const changeStatus = async (status: TicketStatus) => {
    if (!selectedTicket) return;
    const patch: any = { status };
    if (status === 'resolved' || status === 'closed') {
      patch.resolved_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from('support_tickets')
      .update(patch)
      .eq('id', selectedTicket.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Ticket ${statusLabels[status]}` });
    }
  };

  const openCount = tickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed').length;
  const escalatedCount = tickets.filter((t) => t.status === 'escalated').length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Headset className="h-7 w-7 text-primary" />
            Support Tickets
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {openCount} open · {escalatedCount} awaiting response
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        {/* List */}
        <Card className="h-[calc(100vh-14rem)] flex flex-col">
          <div className="p-3 border-b space-y-2">
            <Input
              placeholder="Search tickets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="ai_active">AI Active</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading…</div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No tickets match this filter.
              </div>
            ) : (
              <div className="divide-y">
                {filteredTickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      'w-full text-left px-3 py-3 hover:bg-muted/50 transition',
                      selectedId === t.id && 'bg-muted/60',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium truncate">
                        {t.subject || 'New support request'}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn('text-[10px]', statusStyles[t.status])}
                      >
                        {statusLabels[t.status]}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">
                        {t.user_email} · {t.user_type}
                      </span>
                      <span className="shrink-0 ml-2">
                        {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Detail */}
        <Card className="h-[calc(100vh-14rem)] flex flex-col">
          {!selectedTicket ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
              Select a ticket to view the conversation.
            </div>
          ) : (
            <>
              <div className="p-4 border-b space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold truncate">
                      {selectedTicket.subject || 'New support request'}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {selectedTicket.user_email} · {selectedTicket.user_type} ·{' '}
                      opened {format(new Date(selectedTicket.created_at), 'MMM d, h:mm a')}
                    </p>
                    {selectedTicket.context_route && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Route: <code>{selectedTicket.context_route}</code>
                      </p>
                    )}
                    {selectedTicket.escalation_reason && (
                      <p className="text-xs mt-1 text-red-600 flex items-start gap-1">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{selectedTicket.escalation_reason}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Badge
                      variant="outline"
                      className={cn('text-[10px]', statusStyles[selectedTicket.status])}
                    >
                      {statusLabels[selectedTicket.status]}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => changeStatus('in_progress')}
                    disabled={selectedTicket.status === 'in_progress'}
                  >
                    <Clock className="h-3.5 w-3.5 mr-1" /> In progress
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => changeStatus('resolved')}
                    disabled={selectedTicket.status === 'resolved'}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => changeStatus('closed')}
                    disabled={selectedTicket.status === 'closed'}
                  >
                    Close
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 px-4 py-3 bg-muted/20" ref={scrollRef}>
                {messages.map((m) => (
                  <MessageRow key={m.id} m={m} />
                ))}
              </ScrollArea>

              <form onSubmit={sendReply} className="p-3 border-t bg-background flex gap-2">
                <Input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Reply to this user…"
                  disabled={sending}
                  className="h-10 rounded-full px-4"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!reply.trim() || sending}
                  className="h-10 w-10 rounded-full shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function MessageRow({ m }: { m: Message }) {
  if (m.sender_type === 'system') {
    return (
      <div className="text-[11px] text-muted-foreground italic text-center py-1">
        {m.content}
      </div>
    );
  }
  const config = {
    user: { icon: <User className="h-3 w-3" />, label: 'User', cls: 'bg-background border' },
    ai: {
      icon: <Sparkles className="h-3 w-3" />,
      label: 'AI Assistant',
      cls: 'bg-blue-500/10 border border-blue-500/30',
    },
    admin: {
      icon: <ShieldCheck className="h-3 w-3" />,
      label: 'LUXE Support',
      cls: 'bg-primary/10 border border-primary/30',
    },
  }[m.sender_type];
  return (
    <div className="mb-3 flex flex-col items-start">
      <span className="text-[10px] font-medium text-muted-foreground mb-1 ml-1 flex items-center gap-1">
        {config.icon} {config.label} ·{' '}
        {format(new Date(m.created_at), 'MMM d, h:mm a')}
      </span>
      <div className={cn('rounded-2xl px-3.5 py-2 text-sm max-w-[85%] whitespace-pre-wrap break-words', config.cls)}>
        {m.content}
      </div>
    </div>
  );
}