import { useEffect, useState } from 'react';
import { followUpBossApi, FUBSmartList, FUBPerson } from '@/lib/api/followUpBoss';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ListFilter, Loader2, RefreshCw, Users, ChevronRight, ArrowLeft, Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FUBSmartListsProps {
  title?: string;
}

const FUBSmartLists = ({ title = 'Smart Lists' }: FUBSmartListsProps) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [smartLists, setSmartLists] = useState<FUBSmartList[]>([]);
  const [selectedList, setSelectedList] = useState<FUBSmartList | null>(null);
  const [people, setPeople] = useState<FUBPerson[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);

  const fetchSmartLists = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const res = await followUpBossApi.getSmartLists(100);
    
    if (res.success && res.data?.smartlists) {
      setSmartLists(res.data.smartlists);
    }

    setLoading(false);
    setRefreshing(false);
  };

  const fetchSmartListPeople = async (list: FUBSmartList) => {
    setSelectedList(list);
    setLoadingPeople(true);
    setPeople([]);

    const res = await followUpBossApi.getSmartListPeople(list.id, 50);
    
    if (res.success && res.data?.people) {
      setPeople(res.data.people);
    }

    setLoadingPeople(false);
  };

  useEffect(() => {
    fetchSmartLists();
  }, []);

  if (loading) {
    return (
      <Card className="border-gold/20">
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-gold/20">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-gold font-display flex items-center gap-2">
          <ListFilter className="h-5 w-5" /> 
          {selectedList ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedList(null);
                  setPeople([]);
                }}
                className="p-1 h-auto"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="truncate">{selectedList.name}</span>
            </div>
          ) : (
            title
          )}
        </CardTitle>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => selectedList ? fetchSmartListPeople(selectedList) : fetchSmartLists(true)}
          disabled={refreshing || loadingPeople}
          className="text-muted-foreground hover:text-gold"
        >
          <RefreshCw className={`h-4 w-4 ${(refreshing || loadingPeople) ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {selectedList ? (
            // Show people in selected smart list
            loadingPeople ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-gold" />
              </div>
            ) : people.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No contacts in this list</p>
              </div>
            ) : (
              <div className="space-y-2">
                {people.map((person) => (
                  <div 
                    key={person.id} 
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{person.name || `${person.firstName} ${person.lastName}`}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {person.emails?.[0]?.value && (
                          <span className="flex items-center gap-1 truncate">
                            <Mail className="h-3 w-3" />
                            {person.emails[0].value}
                          </span>
                        )}
                        {person.phones?.[0]?.value && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {person.phones[0].value}
                          </span>
                        )}
                      </div>
                    </div>
                    {person.stage && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        {person.stage}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            // Show smart lists
            smartLists.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No smart lists found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {smartLists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => fetchSmartListPeople(list)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                  >
                    <Users className="h-4 w-4 text-gold shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{list.name}</p>
                      {list.description && (
                        <p className="text-xs text-muted-foreground truncate">{list.description}</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default FUBSmartLists;
