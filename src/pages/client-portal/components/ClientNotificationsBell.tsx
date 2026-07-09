import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Bell, Check, MessageSquare } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

interface Props {
  onOpenMessages: () => void;
}

export function ClientNotificationsBell({ onOpenMessages }: Props) {
  const [open, setOpen] = useState(false);
  const { items, unreadCount, markRead, markAllRead } = useNotifications(10);

  const openThread = async (id: string, isRead: boolean) => {
    if (!isRead) await markRead(id);
    setOpen(false);
    onOpenMessages();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-primary"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Messages</span>
            {unreadCount > 0 && (
              <Badge variant="outline" className="text-[10px] border-red-500/50 text-red-500">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No new messages.
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {items.map((n) => (
                <li key={n.id} className={cn('px-4 py-3 flex gap-3', !n.is_read && 'bg-primary/5')}>
                  <div className={cn('mt-1 h-2 w-2 rounded-full shrink-0', n.is_read ? 'bg-transparent' : 'bg-red-500')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium truncate">{n.client_name || 'Your agent'}</span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {n.message_preview || '(new message)'}
                    </p>
                    <div className="flex gap-1 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => openThread(n.id, n.is_read)}
                      >
                        <MessageSquare className="h-3 w-3" />
                        Open chat
                      </Button>
                      {!n.is_read && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => markRead(n.id)}>
                          <Check className="h-3 w-3" />
                          Mark read
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}