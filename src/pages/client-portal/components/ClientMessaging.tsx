import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { MessageCircle, Send, User } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

interface Message {
  id: string;
  sender_id: string;
  sender_type: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

interface ClientMessagingProps {
  clientAccountId: string;
  userId: string;
}

export function ClientMessaging({ clientAccountId, userId }: ClientMessagingProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchMessages();
    
    // Subscribe to realtime messages
    const channel = supabase
      .channel('client-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'client_messages',
          filter: `client_account_id=eq.${clientAccountId}`
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientAccountId]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('client_messages')
      .select('*')
      .eq('client_account_id', clientAccountId)
      .order('created_at', { ascending: true });

    if (!error) {
      setMessages(data || []);
      // Mark unread messages as read
      markMessagesAsRead(data || []);
    }
    setLoading(false);
  };

  const markMessagesAsRead = async (msgs: Message[]) => {
    const unreadIds = msgs
      .filter(m => m.sender_type === 'agent' && !m.read_at)
      .map(m => m.id);

    if (unreadIds.length > 0) {
      await supabase
        .from('client_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    const { error } = await supabase
      .from('client_messages')
      .insert({
        client_account_id: clientAccountId,
        sender_id: userId,
        sender_type: 'client',
        message: newMessage.trim()
      });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive'
      });
    } else {
      setNewMessage('');
    }
    setSending(false);
  };

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) {
      return format(date, 'h:mm a');
    } else if (isYesterday(date)) {
      return 'Yesterday ' + format(date, 'h:mm a');
    }
    return format(date, 'MMM d, h:mm a');
  };

  return (
    <Card className="flex flex-col h-[400px]">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          Messages
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 p-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading messages...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No messages yet</p>
            <p className="text-sm text-muted-foreground">Send a message to your agent below.</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 px-6" ref={scrollRef}>
            <div className="space-y-4 py-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender_type === 'client' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.sender_type === 'client'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {msg.sender_type === 'agent' && (
                      <div className="flex items-center gap-1 mb-1">
                        <User className="h-3 w-3" />
                        <span className="text-xs font-medium">Your Agent</span>
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                    <p className={`text-xs mt-1 ${
                      msg.sender_type === 'client' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    }`}>
                      {formatMessageDate(msg.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <form onSubmit={sendMessage} className="p-4 border-t flex gap-2">
          <Input
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={sending}
          />
          <Button type="submit" size="icon" disabled={!newMessage.trim() || sending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
