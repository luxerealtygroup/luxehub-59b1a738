import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Headset, Send, X, Minus, Sparkles, User, ShieldCheck, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocation } from 'react-router-dom';

type SenderType = 'user' | 'ai' | 'admin' | 'system';

interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_type: SenderType;
  content: string;
  created_at: string;
}

interface SupportChatWidgetProps {
  /** 'realtor' for /dashboard, 'client' for /client-portal */
  userType: 'realtor' | 'client';
}

const STORAGE_KEY = 'luxehub-support-ticket-id';

export function SupportChatWidget({ userType }: SupportChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { toast } = useToast();

  // Load existing messages when a ticket is known
  useEffect(() => {
    if (!ticketId) {
      setMessages([]);
      setEscalated(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('support_messages')
        .select('id, ticket_id, sender_type, content, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn('support messages load failed', error);
        window.localStorage.removeItem(STORAGE_KEY);
        setTicketId(null);
        return;
      }
      setMessages((data as SupportMessage[]) || []);

      const { data: t } = await supabase
        .from('support_tickets')
        .select('status')
        .eq('id', ticketId)
        .maybeSingle();
      if (t && (t.status === 'escalated' || t.status === 'in_progress' || t.status === 'resolved')) {
        setEscalated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  // Realtime: admin replies come in via support_messages inserts
  useEffect(() => {
    if (!ticketId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session?.access_token) {
        await supabase.realtime.setAuth(sess.session.access_token);
      }
      channel = supabase
        .channel(`support-messages-${ticketId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'support_messages',
            filter: `ticket_id=eq.${ticketId}`,
          },
          (payload) => {
            const next = payload.new as SupportMessage;
            setMessages((prev) => (prev.some((m) => m.id === next.id) ? prev : [...prev, next]));
          },
        )
        .subscribe();
    })();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [ticketId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const persistTicketId = (id: string | null) => {
    setTicketId(id);
    if (typeof window === 'undefined') return;
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);

    // Optimistic user bubble
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        ticket_id: ticketId ?? 'pending',
        sender_type: 'user',
        content: body,
        created_at: new Date().toISOString(),
      },
    ]);
    setInput('');

    const { data, error } = await supabase.functions.invoke('support-chat', {
      body: {
        action: 'send',
        ticket_id: ticketId,
        message: body,
        context: { route: location.pathname, user_type: userType },
      },
    });

    if (error || (data as any)?.error) {
      toast({
        title: 'Support chat error',
        description: (data as any)?.error || error?.message || 'Please try again.',
        variant: 'destructive',
      });
      // Remove optimistic bubble
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } else {
      const resp = data as { ticket_id: string; escalated?: boolean };
      if (resp.ticket_id && resp.ticket_id !== ticketId) {
        persistTicketId(resp.ticket_id);
      }
      if (resp.escalated) setEscalated(true);
    }
    setSending(false);
  };

  const escalateNow = async () => {
    if (!ticketId || sending) {
      // Nothing to escalate yet — nudge to send a first message
      toast({
        title: 'Tell us what you need',
        description: 'Send a short description first, then we can bring in a human.',
      });
      return;
    }
    setSending(true);
    const { error } = await supabase.functions.invoke('support-chat', {
      body: { action: 'escalate', ticket_id: ticketId, message: 'User clicked Talk to a human.' },
    });
    setSending(false);
    if (error) {
      toast({ title: 'Escalation failed', description: error.message, variant: 'destructive' });
    } else {
      setEscalated(true);
      toast({
        title: 'Ticket sent to our team',
        description: 'Kristen will follow up here and by email shortly.',
      });
    }
  };

  const startNewConversation = () => {
    persistTicketId(null);
    setEscalated(false);
    setMessages([]);
  };

  const bubble = useMemo(() => {
    return (m: SupportMessage) => {
      const mine = m.sender_type === 'user';
      const isSystem = m.sender_type === 'system';
      if (isSystem) {
        return (
          <div key={m.id} className="text-[11px] text-muted-foreground italic text-center py-1">
            {m.content}
          </div>
        );
      }
      const label =
        m.sender_type === 'ai'
          ? { icon: <Sparkles className="h-3 w-3" />, name: 'LUXE Support AI' }
          : m.sender_type === 'admin'
          ? { icon: <ShieldCheck className="h-3 w-3" />, name: 'LUXE Support Team' }
          : { icon: <User className="h-3 w-3" />, name: 'You' };
      return (
        <div key={m.id} className={cn('flex mb-3', mine ? 'justify-end' : 'justify-start')}>
          <div className={cn('max-w-[85%] flex flex-col', mine ? 'items-end' : 'items-start')}>
            {!mine && (
              <span className="text-[10px] font-medium text-muted-foreground mb-1 ml-1 flex items-center gap-1">
                {label.icon} {label.name}
              </span>
            )}
            <div
              className={cn(
                'rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm',
                mine
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : m.sender_type === 'admin'
                  ? 'bg-amber-500/10 border border-amber-500/30 rounded-bl-md text-foreground'
                  : 'bg-background border border-border/70 rounded-bl-md text-foreground',
              )}
            >
              {m.content}
            </div>
          </div>
        </div>
      );
    };
  }, []);

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open support chat"
          className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
        >
          <Headset className="h-6 w-6" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(380px,calc(100vw-2.5rem))] h-[min(560px,calc(100vh-2.5rem))] flex flex-col rounded-2xl border border-border/70 bg-card shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-border/70 bg-background/80">
            <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center ring-1 ring-primary/20">
              <Headset className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">LUXEhub Support</p>
              <h3 className="font-display text-sm font-semibold leading-tight">
                {escalated ? 'A human is on the way' : 'Chat with support'}
              </h3>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
              aria-label="Minimize"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          <ScrollArea className="flex-1 px-4 py-3 bg-[hsl(38_30%_98%)]" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="text-center py-8 px-2">
                <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center ring-1 ring-primary/20 mb-3">
                  <MessageCircle className="h-6 w-6" />
                </div>
                <h4 className="font-display text-base font-semibold mb-1">Hi — how can we help?</h4>
                <p className="text-xs text-muted-foreground max-w-[280px] mx-auto">
                  Describe your tech issue and our AI assistant will try to fix it. If it can't, we'll bring in a real person.
                </p>
              </div>
            ) : (
              messages.map(bubble)
            )}
            {sending && (
              <div className="flex justify-start mb-3">
                <div className="bg-background border border-border/70 rounded-2xl rounded-bl-md px-3.5 py-2 text-sm text-muted-foreground shadow-sm">
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
          </ScrollArea>

          {escalated && (
            <div className="px-4 py-2 border-t border-border/60 bg-amber-500/10 text-[11px] text-amber-900">
              This ticket is with our team. They'll reply here and email Kristen — usually within a few hours.
              <button
                type="button"
                className="ml-2 underline font-medium"
                onClick={startNewConversation}
              >
                Start a new chat
              </button>
            </div>
          )}

          <form onSubmit={send} className="p-3 border-t border-border/60 bg-background flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={escalated ? 'Send another update…' : 'Describe your issue…'}
              disabled={sending}
              className="rounded-full h-10 px-4"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || sending}
              className="h-10 w-10 rounded-full shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          {!escalated && (
            <button
              type="button"
              onClick={escalateNow}
              disabled={sending}
              className="text-[11px] text-muted-foreground hover:text-primary underline py-2 px-4 border-t border-border/60 bg-background disabled:opacity-50"
            >
              Talk to a human instead
            </button>
          )}
        </div>
      )}
    </>
  );
}

export default SupportChatWidget;