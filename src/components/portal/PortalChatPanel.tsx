import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { MessageCircle, Send, Headset, User, Briefcase } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

type SenderType = 'client' | 'agent' | 'ops';

interface PortalMessage {
  id: string;
  portal_id: string;
  sender_type: SenderType;
  sender_name: string | null;
  message_body: string;
  created_at: string;
}

interface PortalChatPanelProps {
  portalId: string;
  /** 'client' shows client-styled bubbles on the right; 'agent' shows agent messages on the right. */
  viewerRole: 'client' | 'agent';
}

export function PortalChatPanel({ portalId, viewerRole }: PortalChatPanelProps) {
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('portal_messages')
        .select('*')
        .eq('portal_id', portalId)
        .order('created_at', { ascending: true });
      if (!cancelled) {
        if (error) console.error(error);
        setMessages((data as PortalMessage[]) || []);
        setLoading(false);
      }
    };
    load();

    const channel = supabase
      .channel(`portal-messages-${portalId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'portal_messages',
          filter: `portal_id=eq.${portalId}`,
        },
        (payload) => {
          setMessages((prev) => {
            const next = payload.new as PortalMessage;
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
  }, [portalId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke('portal-send-message', {
      body: { portal_id: portalId, message: body },
    });
    if (error || (data as any)?.error) {
      toast({
        title: 'Message failed',
        description: (data as any)?.error || error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } else {
      setText('');
    }
    setSending(false);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    if (isToday(d)) return format(d, 'h:mm a');
    if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
    return format(d, 'MMM d, h:mm a');
  };

  const isMine = (m: PortalMessage) =>
    (viewerRole === 'client' && m.sender_type === 'client') ||
    (viewerRole === 'agent' && m.sender_type === 'agent');

  const headerFor = (m: PortalMessage) => {
    if (m.sender_type === 'ops') {
      return { icon: <Headset className="h-3 w-3" />, label: 'Luxe Realty Support' };
    }
    if (m.sender_type === 'agent') {
      return { icon: <Briefcase className="h-3 w-3" />, label: m.sender_name || 'Your Agent' };
    }
    return { icon: <User className="h-3 w-3" />, label: m.sender_name || 'Client' };
  };

  const bubbleClass = (m: PortalMessage) => {
    if (isMine(m)) return 'bg-primary text-primary-foreground';
    if (m.sender_type === 'ops') return 'bg-amber-500/15 text-foreground border border-amber-500/30';
    if (m.sender_type === 'agent') return 'bg-muted';
    return 'bg-muted';
  };

  return (
    <Card className="flex flex-col h-[500px]">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          Messages
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 p-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No messages yet</p>
            <p className="text-sm text-muted-foreground">
              {viewerRole === 'client'
                ? 'Send a message to your agent or the Luxe Realty support team below.'
                : 'Reply to this client — the message will also post to Slack for ops.'}
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1 px-6" ref={scrollRef}>
            <div className="space-y-3 py-4">
              {messages.map((m) => {
                const mine = isMine(m);
                const h = headerFor(m);
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg px-4 py-2 ${bubbleClass(m)}`}>
                      {!mine && (
                        <div className="flex items-center gap-1 mb-1 opacity-80">
                          {h.icon}
                          <span className="text-xs font-medium">{h.label}</span>
                        </div>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">{m.message_body}</p>
                      <p
                        className={`text-[11px] mt-1 ${
                          mine ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        }`}
                      >
                        {formatTime(m.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <form onSubmit={send} className="p-4 border-t flex gap-2">
          <Input
            placeholder={viewerRole === 'client' ? 'Type a message…' : 'Reply to client…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={sending}
          />
          <Button type="submit" size="icon" disabled={!text.trim() || sending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}