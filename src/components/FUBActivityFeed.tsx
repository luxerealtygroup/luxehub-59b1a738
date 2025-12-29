import { useEffect, useState } from 'react';
import { followUpBossApi, FUBNote, FUBCall, FUBTextMessage } from '@/lib/api/followUpBoss';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, MessageSquare, FileText, Loader2, PhoneIncoming, PhoneOutgoing, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, parseISO, formatDistanceToNow } from 'date-fns';

interface FUBActivityFeedProps {
  limit?: number;
  showTabs?: boolean;
  title?: string;
}

type ActivityItem = {
  id: string;
  type: 'note' | 'call' | 'text';
  created: string;
  personName?: string;
  userName?: string;
  content: string;
  duration?: number;
  direction?: 'incoming' | 'outgoing';
};

const FUBActivityFeed = ({ limit = 20, showTabs = true, title = 'Recent Activity' }: FUBActivityFeedProps) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notes, setNotes] = useState<FUBNote[]>([]);
  const [calls, setCalls] = useState<FUBCall[]>([]);
  const [texts, setTexts] = useState<FUBTextMessage[]>([]);
  const [activeTab, setActiveTab] = useState('all');

  const fetchActivities = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const [notesRes, callsRes, textsRes] = await Promise.all([
      followUpBossApi.getNotes(limit),
      followUpBossApi.getCalls(limit),
      followUpBossApi.getTextMessages(limit),
    ]);

    if (notesRes.success && notesRes.data?.notes) {
      setNotes(notesRes.data.notes);
    }
    if (callsRes.success && callsRes.data?.calls) {
      setCalls(callsRes.data.calls);
    }
    if (textsRes.success && textsRes.data?.textmessages) {
      setTexts(textsRes.data.textmessages);
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchActivities();
  }, [limit]);

  // Combine and sort all activities
  const allActivities: ActivityItem[] = [
    ...notes.map(n => ({
      id: `note-${n.id}`,
      type: 'note' as const,
      created: n.created,
      personName: n.personName,
      userName: n.userName,
      content: n.subject || n.body || 'Note added',
    })),
    ...calls.map(c => ({
      id: `call-${c.id}`,
      type: 'call' as const,
      created: c.created,
      personName: c.personName,
      userName: c.userName,
      content: `${c.direction === 'incoming' ? 'Incoming' : 'Outgoing'} call`,
      duration: c.duration,
      direction: c.direction,
    })),
    ...texts.map(t => ({
      id: `text-${t.id}`,
      type: 'text' as const,
      created: t.created,
      personName: t.personName,
      userName: t.userName,
      content: t.message || 'Text message',
      direction: t.direction,
    })),
  ].sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

  const getFilteredActivities = () => {
    switch (activeTab) {
      case 'notes':
        return allActivities.filter(a => a.type === 'note');
      case 'calls':
        return allActivities.filter(a => a.type === 'call');
      case 'texts':
        return allActivities.filter(a => a.type === 'text');
      default:
        return allActivities;
    }
  };

  const getActivityIcon = (activity: ActivityItem) => {
    switch (activity.type) {
      case 'call':
        return activity.direction === 'incoming' 
          ? <PhoneIncoming className="h-4 w-4 text-green-500" />
          : <PhoneOutgoing className="h-4 w-4 text-blue-500" />;
      case 'text':
        return <MessageSquare className="h-4 w-4 text-purple-500" />;
      default:
        return <FileText className="h-4 w-4 text-gold" />;
    }
  };

  const getActivityBadge = (activity: ActivityItem) => {
    switch (activity.type) {
      case 'call':
        return <Badge variant="outline" className="text-xs border-green-500/30 text-green-500">Call</Badge>;
      case 'text':
        return <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-500">Text</Badge>;
      default:
        return <Badge variant="outline" className="text-xs border-gold/30 text-gold">Note</Badge>;
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  if (loading) {
    return (
      <Card className="border-gold/20">
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </CardContent>
      </Card>
    );
  }

  const filteredActivities = getFilteredActivities();

  return (
    <Card className="border-gold/20">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-gold font-display flex items-center gap-2">
          <Phone className="h-5 w-5" /> {title}
        </CardTitle>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => fetchActivities(true)}
          disabled={refreshing}
          className="text-muted-foreground hover:text-gold"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {showTabs && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="all">All ({allActivities.length})</TabsTrigger>
              <TabsTrigger value="calls">Calls ({calls.length})</TabsTrigger>
              <TabsTrigger value="texts">Texts ({texts.length})</TabsTrigger>
              <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <ScrollArea className="h-[400px]">
          {filteredActivities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No activities found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredActivities.map((activity) => (
                <div 
                  key={activity.id} 
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="mt-1">{getActivityIcon(activity)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getActivityBadge(activity)}
                      {activity.personName && (
                        <span className="text-sm font-medium truncate">{activity.personName}</span>
                      )}
                      {activity.duration && (
                        <span className="text-xs text-muted-foreground">
                          ({formatDuration(activity.duration)})
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {activity.content}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {activity.userName && (
                        <span className="text-xs text-muted-foreground">by {activity.userName}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(parseISO(activity.created), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default FUBActivityFeed;
