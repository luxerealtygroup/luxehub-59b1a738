import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useContext } from 'react';
import { ViewAsAgentContext } from '@/hooks/useViewAsAgent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { blockPortalWrite, usePortalPreview } from '@/hooks/usePortalPreview';
import { MessageCircle, Send, Headset, User, Briefcase, Lock, Eye, EyeOff, Hash } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

type SenderType = 'client' | 'agent' | 'ops';

interface PortalMessage {
  id: string;
  portal_id: string;
  sender_type: SenderType;
  sender_name: string | null;
  message_body: string;
  created_at: string;
  is_internal?: boolean;
  source_slack_channel_id?: string | null;
  source_slack_ts?: string | null;
}

interface PortalChatPanelProps {
  portalId: string;
  /** 'client' shows client-styled bubbles on the right; 'agent' shows agent messages on the right. */
  viewerRole: 'client' | 'agent';
  /**
   * Optional agent user id to attribute the outgoing message to. When set and
   * the caller is an admin/owner, the edge function stores the message under
   * this agent's name instead of the caller's profile. Falls back to the
   * "View as Agent" context when not provided.
   */
  sendAsAgentId?: string | null;
}

export function PortalChatPanel({ portalId, viewerRole, sendAsAgentId: sendAsAgentIdProp }: PortalChatPanelProps) {
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const viewCtx = useContext(ViewAsAgentContext);
  const { isPreview } = usePortalPreview();
  const sendAsAgentId =
    viewerRole === 'agent'
      ? sendAsAgentIdProp ??
        (viewCtx?.isViewingAsAgent && viewCtx.viewingAgentId ? viewCtx.viewingAgentId : null)
      : null;

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

    // Ensure the realtime socket is using the current auth token so RLS
    // authorizes postgres_changes broadcasts to this subscriber.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session?.access_token) {
        await supabase.realtime.setAuth(sess.session.access_token);
      }
      if (cancelled) return;
      channel = supabase
        .channel(`portal-messages-${portalId}-${viewerRole}`)
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
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('portal_messages realtime status:', status);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [portalId, viewerRole]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    if (blockPortalWrite('Sending messages')) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke('portal-send-message', {
      body: {
        portal_id: portalId,
        message: body,
        send_as_agent_id: sendAsAgentId ?? undefined,
      },
    });
    if (error || (data as any)?.error) {
      toast({
        title: 'Message failed',
        description: (data as any)?.error || error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } else {
      // Optimistically append the just-inserted message so the sender sees it
      // immediately even if the realtime broadcast for their own row is
      // delayed or filtered. The realtime handler dedupes by id.
      const inserted = (data as { message?: PortalMessage })?.message;
      if (inserted?.id) {
        setMessages((prev) =>
          prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted],
        );
      }
      setText('');
    }
    setSending(false);
  };

  /**
   * Flip a message between internal (agent-only) and client-visible. This is
   * the "unpublish" action for anything pushed in from Slack. RLS blocks the
   * client from reading internal rows, so this is a real visibility change.
   */
  const setVisibility = async (m: PortalMessage, nextInternal: boolean) => {
    if (blockPortalWrite('Changing message visibility')) return;
    const { error } = await supabase
      .from('portal_messages')
      .update({ is_internal: nextInternal })
      .eq('id', m.id);
    if (error) {
      toast({
        title: 'Could not update visibility',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    setMessages((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, is_internal: nextInternal } : x)),
    );
    toast({
      title: nextInternal ? 'Hidden from client' : 'Now visible to client',
      description: nextInternal
        ? 'This message is internal and no longer shown in the client portal.'
        : 'The client can now see this message.',
    });
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
    if (isMine(m)) return 'bg-primary text-primary-foreground shadow-sm';
    if (m.sender_type === 'ops')
      return 'bg-amber-500/10 text-foreground border border-amber-500/30 shadow-sm';
    return 'bg-background text-foreground border border-border/70 shadow-sm';
  };

  const avatarClass = (m: PortalMessage) => {
    if (m.sender_type === 'ops') return 'bg-amber-500/15 text-amber-700 ring-amber-500/30';
    if (m.sender_type === 'agent') return 'bg-primary/10 text-primary ring-primary/25';
    return 'bg-foreground/10 text-foreground ring-foreground/20';
  };

  return (
    <Card className="flex flex-col h-[calc(100vh-14rem)] min-h-[480px] max-h-[720px] luxe-card overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/60 bg-background/70">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="eyebrow leading-none">Conversation</p>
            <CardTitle className="font-display text-lg font-semibold tracking-tight mt-1">
              Messages
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 p-0 bg-[hsl(38_30%_98%)]">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 mb-4">
              <MessageCircle className="h-6 w-6" />
            </div>
            <h3 className="font-display text-lg font-semibold tracking-tight mb-1">Start the conversation</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {viewerRole === 'client'
                ? 'Send a message to your agent or the Luxe Realty support team below.'
                : 'Reply to this client — the message will also post to Slack for ops.'}
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1 px-4 sm:px-6" ref={scrollRef}>
            <div className="space-y-4 py-5">
              {messages.map((m) => {
                const mine = isMine(m);
                const h = headerFor(m);
                return (
                  <div
                    key={m.id}
                    className={`flex items-end gap-2 animate-fade-in ${mine ? 'justify-end' : 'justify-start'}`}
                  >
                    {!mine && (
                      <div
                        className={`hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-2 ${avatarClass(m)}`}
                      >
                        {h.icon}
                      </div>
                    )}
                    <div className={`max-w-[85%] sm:max-w-[70%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      {!mine && (
                        <span className="text-[11px] font-medium text-muted-foreground mb-1 ml-1">
                          {h.label}
                        </span>
                      )}
                      <div
                        className={`rounded-2xl px-4 py-2.5 ${bubbleClass(m)} ${
                          mine ? 'rounded-br-md' : 'rounded-bl-md'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                          {m.message_body}
                        </p>
                      </div>
                      <p
                        className={`text-[10px] mt-1 tabular-nums ${
                          mine ? 'text-muted-foreground mr-1' : 'text-muted-foreground ml-1'
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

        {isPreview ? (
          <div className="p-3 sm:p-4 border-t border-border/60 bg-muted/30 text-center text-xs text-muted-foreground">
            Read-only preview — messaging is disabled.
          </div>
        ) : (
        <form onSubmit={send} className="p-3 sm:p-4 border-t border-border/60 bg-background flex gap-2">
          <Input
            placeholder={viewerRole === 'client' ? 'Type a message…' : 'Reply to client…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={sending}
            className="rounded-full h-11 px-4 border-border/70 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary transition-colors"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!text.trim() || sending}
            className="h-11 w-11 rounded-full shadow-gold shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        )}
      </CardContent>
    </Card>
  );
}