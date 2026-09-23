import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Search, Home } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAgentConversations } from '@/hooks/useAgentConversations';
import { useUserRole } from '@/hooks/useUserRole';

export default function Messages() {
  const { conversations, loading, totalUnread } = useAgentConversations();
  const { isAdmin } = useUserRole();
  const [search, setSearch] = useState('');
  const [agent, setAgent] = useState('all');

  const agents = useMemo(
    () => Array.from(new Set(conversations.map((c) => c.agentName))).sort((a, b) => a.localeCompare(b)),
    [conversations],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (agent !== 'all' && c.agentName !== agent) return false;
      if (!q) return true;
      return (
        c.clientName.toLowerCase().includes(q) ||
        (c.address ?? '').toLowerCase().includes(q) ||
        (c.lastMessage ?? '').toLowerCase().includes(q)
      );
    });
  }, [conversations, search, agent]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl text-foreground">Messages</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? 'Every client portal conversation on the team.' : 'Your client portal conversations.'}
            {totalUnread > 0 && ` · ${totalUnread} unread`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search client, address or message"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isAdmin && (
          <Select value={agent} onValueChange={setAgent}>
            <SelectTrigger className="w-[190px] max-w-full">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Conversations ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 text-center text-sm text-muted-foreground animate-pulse">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No conversations yet.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {rows.map((c) => (
                <li key={c.portalId}>
                  <Link
                    to={`/dashboard/messages/${c.portalId}`}
                    className="flex gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="mt-1 h-9 w-9 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-4 w-4 text-gold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-sm truncate">{c.clientName}</span>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {c.lastAt ? formatDistanceToNow(new Date(c.lastAt), { addSuffix: true }) : 'No messages'}
                        </span>
                      </div>
                      {c.address && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                          <Home className="h-3 w-3 shrink-0" />
                          {c.address}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {c.lastMessage
                          ? `${c.lastSenderType === 'client' ? c.clientName : c.lastSender ?? 'Agent'}: ${c.lastMessage}`
                          : 'No messages yet'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        {isAdmin && (
                          <Badge variant="outline" className="text-[10px]">
                            {c.agentName}
                          </Badge>
                        )}
                        {c.unread > 0 && (
                          <Badge className="bg-red-500 hover:bg-red-500 text-white text-[10px]">
                            {c.unread} new
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
