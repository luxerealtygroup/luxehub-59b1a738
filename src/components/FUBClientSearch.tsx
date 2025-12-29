import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, UserPlus, Phone, Mail, Loader2 } from 'lucide-react';
import { followUpBossApi, FUBPerson } from '@/lib/api/followUpBoss';
import { useToast } from '@/hooks/use-toast';

interface FUBClientSearchProps {
  onSelectClient: (client: { id: number; name: string; email?: string; phone?: string; source?: string }) => void;
  trigger?: React.ReactNode;
}

export const FUBClientSearch = ({ onSelectClient, trigger }: FUBClientSearchProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FUBPerson[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await followUpBossApi.searchPeople(query);
      if (response.success && response.data?.people) {
        setResults(response.data.people);
        if (response.data.people.length === 0) {
          toast({ title: 'No clients found', description: 'Try a different search term' });
        }
      } else {
        toast({ 
          title: 'Search failed', 
          description: response.error || 'Could not search Follow Up Boss', 
          variant: 'destructive' 
        });
      }
    } catch (error) {
      console.error('FUB search error:', error);
      toast({ title: 'Error', description: 'Failed to search clients', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (person: FUBPerson, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const primaryEmail = person.emails?.[0]?.value;
    const primaryPhone = person.phones?.[0]?.value;
    
    onSelectClient({
      id: person.id,
      name: person.name || `${person.firstName} ${person.lastName}`,
      email: primaryEmail,
      phone: primaryPhone,
      source: person.source || undefined,
    });
    
    toast({ title: 'Client selected', description: `${person.name || `${person.firstName} ${person.lastName}`} imported from Follow Up Boss` });
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setQuery('');
      setResults([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} modal={true}>
      <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
        {trigger || (
          <Button variant="outline" size="sm" type="button">
            <Search className="h-4 w-4 mr-2" />
            Search FUB
          </Button>
        )}
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="bg-background/80" />
        <DialogContent 
          className="max-w-lg border-primary/20 bg-card z-[100]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="text-primary font-display flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Import from Follow Up Boss
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSearch} className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Input
              placeholder="Search clients by name, email, or phone..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
              autoFocus
            />
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </form>

          <div className="max-h-80 overflow-y-auto space-y-2">
            {results.map((person) => (
              <Card 
                key={person.id} 
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={(e) => handleSelect(person, e)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{person.name || `${person.firstName} ${person.lastName}`}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {person.emails?.[0] && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {person.emails[0].value}
                          </span>
                        )}
                        {person.phones?.[0] && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {person.phones[0].value}
                          </span>
                        )}
                      </div>
                    </div>
                    {person.stage && (
                      <Badge variant="outline" className="text-xs">
                        {person.stage}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {results.length === 0 && !loading && (
              <p className="text-center text-muted-foreground py-8 text-sm">
                Search for clients in Follow Up Boss
              </p>
            )}
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};
