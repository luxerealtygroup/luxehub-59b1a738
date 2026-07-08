import { useMemo, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Bell, Check, MessageSquare, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AgentPortalDialog } from '@/components/AgentPortalDialog';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

type FilterKey = 'all' | 'unread' | 'read';

export default function Notifications() {
  const { items, loading, unreadCount, markRead, markAllRead } = useNotifications(200);
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(() => {
    if (filter === 'unread') return items.filter((n) => !n.is_read);
    if (filter === 'read') return items.filter((n) => n.is_read);
    return items;
  }, [items, filter]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground flex items-center gap-2">
            <Bell className="h-6 w-6 text-gold" />
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground">
            Live activity across your client portals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Badge variant="outline" className="border-red-500/50 text-red-500">
              {unreadCount} unread
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0} className="gap-2">
            <Check className="h-4 w-4" />
            Mark all as read
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">History ({filtered.length})</CardTitle>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
              <TabsTrigger value="read">Read</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 flex justify-center text-muted-foreground gap-2 items-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Nothing here.</div>
          ) : (
            <div className="overflow-x-auto border border-border/50 rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Client</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((n) => (
                    <TableRow key={n.id} className={cn('border-border/50', !n.is_read && 'bg-blue-500/5')}>
                      <TableCell>
                        <span className={cn('block h-2 w-2 rounded-full', n.is_read ? 'bg-muted' : 'bg-red-500')} />
                      </TableCell>
                      <TableCell className="font-medium">{n.client_name || 'Client'}</TableCell>
                      <TableCell className="text-muted-foreground max-w-md truncate">
                        {n.message_preview || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        <div>{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</div>
                        <div className="text-muted-foreground/60">
                          {format(new Date(n.created_at), 'MMM d, h:mm a')}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <AgentPortalDialog
                            clientName={n.client_accounts?.full_name || n.client_name || undefined}
                            clientEmail={n.client_accounts?.email}
                            fubPersonId={n.client_accounts?.fub_person_id ?? null}
                            defaultType={(n.client_accounts?.client_type as 'buyer' | 'seller') || undefined}
                            initialTab="messages"
                            trigger={
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs gap-1"
                                onClick={() => !n.is_read && markRead(n.id)}
                              >
                                <MessageSquare className="h-3 w-3" />
                                Open chat
                              </Button>
                            }
                          />
                          {!n.is_read && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs gap-1"
                              onClick={() => markRead(n.id)}
                            >
                              <Check className="h-3 w-3" />
                              Mark read
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}