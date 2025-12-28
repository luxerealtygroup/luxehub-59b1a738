import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, User, Phone, Mail, Search, Trash2, Edit2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FUBClientSearch } from '@/components/FUBClientSearch';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PipelineClient {
  id: string;
  client_name: string;
  email: string | null;
  phone: string | null;
  stage: number;
  notes: string | null;
  property_interest: string | null;
  source: string | null;
  created_at: string;
}

// Stage definitions with timeline descriptions
const stageDefinitions: Record<number, { label: string; description: string; color: string }> = {
  10: { label: '10', description: 'Next 30 days', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  9: { label: '9', description: 'Next 60 days', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  8: { label: '8', description: 'Next 90 days', color: 'bg-lime-500/20 text-lime-400 border-lime-500/30' },
  7: { label: '7', description: 'Next 120 days', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  6: { label: '6', description: 'Next 6 months', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  5: { label: '5', description: 'Next 9 months', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  4: { label: '4', description: 'Next 12 months', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  3: { label: '3', description: '12-18 months', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  2: { label: '2', description: '18-24 months', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
  1: { label: '1', description: '24+ months', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
};

const stageOrder = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const Pipeline = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<PipelineClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editClient, setEditClient] = useState<PipelineClient | null>(null);
  
  const [newClient, setNewClient] = useState({
    client_name: '',
    email: '',
    phone: '',
    stage: '5',
    notes: '',
    property_interest: '',
    source: ''
  });

  const fetchClients = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('pipeline_clients')
      .select('*')
      .eq('user_id', user.id)
      .order('stage', { ascending: false });
    
    if (error) {
      console.error('Error fetching clients:', error);
    } else {
      setClients((data as PipelineClient[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchClients();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (editClient) {
      // Update existing client
      const { error } = await supabase
        .from('pipeline_clients')
        .update({
          client_name: newClient.client_name,
          email: newClient.email || null,
          phone: newClient.phone || null,
          stage: parseInt(newClient.stage),
          notes: newClient.notes || null,
          property_interest: newClient.property_interest || null,
          source: newClient.source || null
        })
        .eq('id', editClient.id);

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Client updated!' });
        closeDialog();
        fetchClients();
      }
    } else {
      // Insert new client
      const { error } = await supabase.from('pipeline_clients').insert({
        user_id: user.id,
        client_name: newClient.client_name,
        email: newClient.email || null,
        phone: newClient.phone || null,
        stage: parseInt(newClient.stage),
        notes: newClient.notes || null,
        property_interest: newClient.property_interest || null,
        source: newClient.source || null
      });

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Client added to pipeline!' });
        closeDialog();
        fetchClients();
      }
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditClient(null);
    setNewClient({ client_name: '', email: '', phone: '', stage: '5', notes: '', property_interest: '', source: '' });
  };

  const openEditDialog = (client: PipelineClient) => {
    setEditClient(client);
    setNewClient({
      client_name: client.client_name,
      email: client.email || '',
      phone: client.phone || '',
      stage: client.stage.toString(),
      notes: client.notes || '',
      property_interest: client.property_interest || '',
      source: client.source || ''
    });
    setDialogOpen(true);
  };

  const updateStage = async (clientId: string, newStage: number) => {
    const { error } = await supabase
      .from('pipeline_clients')
      .update({ stage: newStage })
      .eq('id', clientId);
    
    if (!error) {
      fetchClients();
      toast({ title: `Client moved to Stage ${newStage}` });
    }
  };

  const deleteClient = async (clientId: string) => {
    const { error } = await supabase
      .from('pipeline_clients')
      .delete()
      .eq('id', clientId);
    
    if (!error) {
      fetchClients();
      toast({ title: 'Client removed from pipeline' });
    }
  };

  const handleFUBClientSelect = (client: { name: string; email?: string; phone?: string }) => {
    setNewClient({
      ...newClient,
      client_name: client.name,
      email: client.email || newClient.email,
      phone: client.phone || newClient.phone,
      source: 'Follow Up Boss'
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-primary animate-pulse">Loading pipeline...</div>;
  }

  const clientsByStage = stageOrder.reduce((acc, stage) => {
    acc[stage] = clients.filter(c => c.stage === stage);
    return acc;
  }, {} as Record<number, PipelineClient[]>);

  const totalClients = clients.length;
  const hotLeads = clients.filter(c => c.stage >= 8).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Client Pipeline</h1>
          <p className="text-muted-foreground mt-1">
            {totalClients} clients in pipeline • <span className="text-primary font-semibold">{hotLeads} hot leads</span>
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" /> Add Client
            </Button>
          </DialogTrigger>
          <DialogContent className="border-primary/20 bg-card max-w-md">
            <DialogHeader>
              <DialogTitle className="text-primary font-display">
                {editClient ? 'Edit Client' : 'Add Client to Pipeline'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Client name *"
                  value={newClient.client_name}
                  onChange={(e) => setNewClient({ ...newClient, client_name: e.target.value })}
                  required
                  className="flex-1"
                />
                <FUBClientSearch 
                  onSelectClient={handleFUBClientSelect}
                  trigger={
                    <Button type="button" variant="outline" size="icon" title="Import from Follow Up Boss">
                      <Search className="h-4 w-4" />
                    </Button>
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="email"
                  placeholder="Email"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                />
                <Input
                  type="tel"
                  placeholder="Phone"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Buying Timeline Stage</Label>
                <Select value={newClient.stage} onValueChange={(v) => setNewClient({ ...newClient, stage: v })}>
                  <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                  <SelectContent>
                    {stageOrder.map(s => (
                      <SelectItem key={s} value={s.toString()}>
                        Stage {s} - {stageDefinitions[s].description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Property interest (e.g., 3BR in Downtown)"
                value={newClient.property_interest}
                onChange={(e) => setNewClient({ ...newClient, property_interest: e.target.value })}
              />
              <Input
                placeholder="Source (e.g., Referral, Open House)"
                value={newClient.source}
                onChange={(e) => setNewClient({ ...newClient, source: e.target.value })}
              />
              <Textarea
                placeholder="Notes"
                value={newClient.notes}
                onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                rows={3}
              />
              <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                {editClient ? 'Update Client' : 'Add Client'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stage Legend */}
      <div className="flex flex-wrap gap-2">
        {stageOrder.map(stage => (
          <Badge key={stage} className={`${stageDefinitions[stage].color} text-xs`}>
            {stage}: {stageDefinitions[stage].description}
          </Badge>
        ))}
      </div>

      {/* Pipeline Grid */}
      <ScrollArea className="w-full">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-4 min-w-[800px] pb-4">
          {stageOrder.map((stage) => (
            <Card key={stage} className="border-primary/10 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <div>
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full mr-2 text-xs font-bold ${stageDefinitions[stage].color}`}>
                      {stage}
                    </span>
                    <span className="text-muted-foreground text-xs">{stageDefinitions[stage].description}</span>
                  </div>
                  <Badge variant="outline" className="border-primary/30 text-primary">
                    {clientsByStage[stage].length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {clientsByStage[stage].map((client) => (
                  <div 
                    key={client.id} 
                    className="p-3 rounded-lg bg-background/50 border border-primary/10 hover:border-primary/30 transition-colors group"
                  >
                    <div className="flex items-start justify-between">
                      <p className="font-medium text-foreground text-sm truncate flex-1">{client.client_name}</p>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6"
                          onClick={() => openEditDialog(client)}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => deleteClient(client.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    {client.email && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {client.email}
                      </p>
                    )}
                    {client.phone && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {client.phone}
                      </p>
                    )}
                    {client.property_interest && (
                      <p className="text-xs text-primary mt-1 truncate">
                        {client.property_interest}
                      </p>
                    )}
                    {client.source && (
                      <Badge variant="outline" className="text-xs mt-1">
                        {client.source}
                      </Badge>
                    )}
                    <div className="mt-2">
                      <Select value={client.stage.toString()} onValueChange={(v) => updateStage(client.id, parseInt(v))}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {stageOrder.map(s => (
                            <SelectItem key={s} value={s.toString()} className="text-xs">
                              Stage {s} - {stageDefinitions[s].description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
                {clientsByStage[stage].length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No clients</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default Pipeline;
