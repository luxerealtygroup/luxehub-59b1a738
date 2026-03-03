import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Phone, Mail, Search, Trash2, Edit2, Loader2, DollarSign, Home, Users, Calendar, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FUBClientSearch } from '@/components/FUBClientSearch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { differenceInDays, format, parseISO } from 'date-fns';
import { SOURCE_OPTIONS } from '@/lib/constants/sourceOptions';
import { formatCurrency, formatNumber } from '@/lib/utils';

interface PipelineClient {
  id: string;
  client_name: string;
  client_type: 'buyer' | 'seller';
  stage: number;
  source?: string;
  phone?: string;
  email?: string;
  notes?: string;
  projected_sale_amount: number;
  projected_gci: number;
  commission_percent: number;
  split_percent: number;
  expected_pending_date?: string;
  created_at: string;
  last_contact?: string;
  fub_person_id?: number;
}

interface NewClient {
  client_name: string;
  client_type: 'buyer' | 'seller';
  stage: number;
  source: string;
  phone: string;
  email: string;
  notes: string;
  projected_sale_amount: number;
  commission_percent: number;
  split_percent: number;
  expected_pending_date: string;
  fub_person_id?: number;
}

const stageLabels: { [key: number]: string } = {
  1: 'Lead',
  2: 'Qualified',
  3: 'Showing',
  4: 'Offer',
  5: 'Pending',
};

const Pipeline = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<PipelineClient[]>([]);
  const [filteredClients, setFilteredClients] = useState<PipelineClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<PipelineClient | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'buyer' | 'seller'>('all');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [newClient, setNewClient] = useState<NewClient>({
    client_name: '',
    client_type: 'buyer',
    stage: 1,
    source: '',
    phone: '',
    email: '',
    notes: '',
    projected_sale_amount: 0,
    commission_percent: 3,
    split_percent: 70,
    expected_pending_date: '',
  });

  useEffect(() => {
    if (user) {
      fetchClients();
    }
  }, [user]);

  useEffect(() => {
    filterClients();
  }, [clients, searchTerm, filterType, filterStage]);

  const fetchClients = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('pipeline_clients')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch pipeline clients',
        variant: 'destructive',
      });
      return;
    }

    setClients(data || []);
    setLoading(false);
  };

  const filterClients = () => {
    let filtered = [...clients];

    if (searchTerm) {
      filtered = filtered.filter(
        (c) =>
          c.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.phone?.includes(searchTerm)
      );
    }

    if (filterType !== 'all') {
      filtered = filtered.filter((c) => c.client_type === filterType);
    }

    if (filterStage !== 'all') {
      filtered = filtered.filter((c) => c.stage === parseInt(filterStage));
    }

    setFilteredClients(filtered);
  };

  const calculateGCI = (saleAmount: number, commissionPercent: number, splitPercent: number) => {
    return (saleAmount * (commissionPercent / 100) * (splitPercent / 100));
  };

  const handleAddClient = async () => {
    if (!user || !newClient.client_name) {
      toast({
        title: 'Error',
        description: 'Please fill in required fields',
        variant: 'destructive',
      });
      return;
    }

    const gci = calculateGCI(
      newClient.projected_sale_amount,
      newClient.commission_percent,
      newClient.split_percent
    );

    const { error } = await supabase.from('pipeline_clients').insert({
      user_id: user.id,
      ...newClient,
      projected_gci: gci,
    });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to add client',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Success',
      description: 'Client added to pipeline',
    });

    setAddDialogOpen(false);
    setNewClient({
      client_name: '',
      client_type: 'buyer',
      stage: 1,
      source: '',
      phone: '',
      email: '',
      notes: '',
      projected_sale_amount: 0,
      commission_percent: 3,
      split_percent: 70,
      expected_pending_date: '',
    });
    fetchClients();
  };

  const handleUpdateClient = async () => {
    if (!editingClient) return;

    const gci = calculateGCI(
      editingClient.projected_sale_amount,
      editingClient.commission_percent,
      editingClient.split_percent
    );

    const { error } = await supabase
      .from('pipeline_clients')
      .update({
        ...editingClient,
        projected_gci: gci,
      })
      .eq('id', editingClient.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update client',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Success',
      description: 'Client updated',
    });

    setEditingClient(null);
    fetchClients();
  };

  const handleDeleteClient = async (id: string) => {
    const { error } = await supabase.from('pipeline_clients').delete().eq('id', id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete client',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Success',
      description: 'Client removed from pipeline',
    });

    fetchClients();
  };

  const handleFUBSelect = (person: any) => {
    setNewClient({
      ...newClient,
      client_name: person.name || '',
      email: person.emails?.[0]?.value || '',
      phone: person.phones?.[0]?.value || '',
      fub_person_id: person.id,
    });
  };

  const totalProjectedGCI = filteredClients.reduce((sum, c) => sum + c.projected_gci, 0);
  const totalProjectedVolume = filteredClients.reduce((sum, c) => sum + c.projected_sale_amount, 0);
  const buyers = filteredClients.filter((c) => c.client_type === 'buyer');
  const sellers = filteredClients.filter((c) => c.client_type === 'seller');
  const buyerGCI = buyers.reduce((sum, c) => sum + c.projected_gci, 0);
  const sellerGCI = sellers.reduce((sum, c) => sum + c.projected_gci, 0);

  // Calculate quarterly projections
  const currentMonth = new Date().getMonth();
  const currentQuarter = Math.floor(currentMonth / 3);
  const quarters = [
    { name: 'Q1', months: [0, 1, 2], label: 'Jan-Mar' },
    { name: 'Q2', months: [3, 4, 5], label: 'Apr-Jun' },
    { name: 'Q3', months: [6, 7, 8], label: 'Jul-Sep' },
    { name: 'Q4', months: [9, 10, 11], label: 'Oct-Dec' },
  ];

  const quarterlyProjections = quarters.map((quarter, index) => {
    const quarterClients = filteredClients.filter((client) => {
      if (!client.expected_pending_date) return false;
      const pendingMonth = new Date(client.expected_pending_date).getMonth();
      return quarter.months.includes(pendingMonth);
    });

    const projectedGci = quarterClients.reduce((sum, c) => sum + c.projected_gci, 0);
    const dealCount = quarterClients.length;

    return {
      ...quarter,
      projectedGci,
      dealCount,
      isPast: index < currentQuarter,
      isCurrent: index === currentQuarter,
    };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground font-display">Pipeline</h1>
          <p className="text-muted-foreground">Manage your active clients and deals</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gold hover:bg-gold/90">
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Pipeline Client</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Search Follow Up Boss</Label>
                <FUBClientSearch onSelect={handleFUBSelect} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Client Name *</Label>
                  <Input
                    value={newClient.client_name}
                    onChange={(e) => setNewClient({ ...newClient, client_name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <Label>Client Type *</Label>
                  <Select
                    value={newClient.client_type}
                    onValueChange={(value: 'buyer' | 'seller') =>
                      setNewClient({ ...newClient, client_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buyer">Buyer</SelectItem>
                      <SelectItem value="seller">Seller</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={newClient.phone}
                    onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    value={newClient.email}
                    onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Stage *</Label>
                  <Select
                    value={newClient.stage.toString()}
                    onValueChange={(value) => setNewClient({ ...newClient, stage: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(stageLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Source</Label>
                  <Select
                    value={newClient.source}
                    onValueChange={(value) => setNewClient({ ...newClient, source: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_OPTIONS.map((source) => (
                        <SelectItem key={source} value={source}>
                          {source}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Projected Sale Amount</Label>
                  <Input
                    type="number"
                    value={newClient.projected_sale_amount || ''}
                    onChange={(e) =>
                      setNewClient({ ...newClient, projected_sale_amount: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="500000"
                  />
                </div>
                <div>
                  <Label>Commission %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={newClient.commission_percent || ''}
                    onChange={(e) =>
                      setNewClient({ ...newClient, commission_percent: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="3"
                  />
                </div>
                <div>
                  <Label>Split %</Label>
                  <Input
                    type="number"
                    step="1"
                    value={newClient.split_percent || ''}
                    onChange={(e) =>
                      setNewClient({ ...newClient, split_percent: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="70"
                  />
                </div>
              </div>

              <div>
                <Label>Expected Pending Date</Label>
                <Input
                  type="date"
                  value={newClient.expected_pending_date}
                  onChange={(e) => setNewClient({ ...newClient, expected_pending_date: e.target.value })}
                />
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={newClient.notes}
                  onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={3}
                />
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Projected GCI:</span>
                  <span className="text-xl font-bold text-green-400">
                    {formatCurrency(calculateGCI(newClient.projected_sale_amount, newClient.commission_percent, newClient.split_percent))}
                  </span>
                </div>
              </div>

              <Button onClick={handleAddClient} className="w-full bg-gold hover:bg-gold/90">
                Add to Pipeline
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-primary/10 bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Clients</p>
                <p className="text-xl font-bold text-foreground">{filteredClients.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-blue-500/20 bg-gradient-to-br from-card to-blue-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Home className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Volume</p>
                <p className="text-xl font-bold text-gold">{formatCurrency(totalProjectedVolume)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-gold/20 bg-gradient-to-br from-card to-gold/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gold/10">
                <DollarSign className="h-5 w-5 text-gold" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Projected GCI</p>
                <p className="text-xl font-bold text-gold">{formatCurrency(totalProjectedGCI)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-primary/10 bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Buyers ({buyers.length})</p>
                <p className="text-lg font-bold text-blue-400">{formatCurrency(buyerGCI)} GCI</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-primary/10 bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Home className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sellers ({sellers.length})</p>
                <p className="text-lg font-bold text-emerald-400">{formatCurrency(sellerGCI)} GCI</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quarterly Projections */}
      <Card className="border-gold/20">
        <CardHeader>
          <CardTitle className="text-gold font-display flex items-center gap-2">
            <Target className="h-5 w-5" />
            Quarterly Projections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {quarterlyProjections.map((quarter) => (
              <div
                key={quarter.name}
                className={`p-4 rounded-lg border ${
                  quarter.isCurrent
                    ? 'bg-gold/10 border-gold/30'
                    : quarter.isPast
                    ? 'bg-muted/50 border-border'
                    : 'bg-card border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-foreground">{quarter.name}</h3>
                  {quarter.isCurrent && <Badge className="bg-gold">Current</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mb-3">{quarter.label}</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Deals</span>
                    <span className="font-medium text-foreground">{quarter.dealCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Projected GCI</span>
                    <span className="text-muted-foreground ml-auto">
                      Projected GCI: <span className="text-green-500 font-medium">{formatCurrency(quarter.projectedGci)}</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="buyer">Buyers</SelectItem>
                <SelectItem value="seller">Sellers</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStage} onValueChange={setFilterStage}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Filter by stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {Object.entries(stageLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Client List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredClients.map((client) => (
          <Card key={client.id} className="border-border/50 hover:border-gold/30 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">{client.client_name}</h3>
                    <Badge variant={client.client_type === 'buyer' ? 'default' : 'secondary'}>
                      {client.client_type}
                    </Badge>
                    <Badge variant="outline">{stageLabels[client.stage]}</Badge>
                  </div>
                  {client.source && (
                    <p className="text-xs text-muted-foreground">Source: {client.source}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingClient(client)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteClient(client.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                {client.phone && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <span>{client.phone}</span>
                  </div>
                )}
                {client.email && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    <span className="truncate">{client.email}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mb-3">
                <span>Stage: {stageLabels[client.stage] || `Stage ${client.stage}`}</span>
                <span>Source: {client.source || 'N/A'}</span>
                <span>Value: {formatCurrency(client.projected_sale_amount)}</span>
                <span>GCI: {formatCurrency(client.projected_gci)}</span>
              </div>
              {client.expected_pending_date && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>Expected: {format(parseISO(client.expected_pending_date), 'MMM d, yyyy')}</span>
                </div>
              )}

              {client.notes && (
                <p className="text-xs text-muted-foreground mt-2 p-2 bg-muted/50 rounded">
                  {client.notes}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredClients.length === 0 && (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No clients found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || filterType !== 'all' || filterStage !== 'all'
                ? 'Try adjusting your filters'
                : 'Add your first client to get started'}
            </p>
            {!searchTerm && filterType === 'all' && filterStage === 'all' && (
              <Button onClick={() => setAddDialogOpen(true)} className="bg-gold hover:bg-gold/90">
                <Plus className="h-4 w-4 mr-2" />
                Add Client
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingClient} onOpenChange={() => setEditingClient(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          {editingClient && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Client Name *</Label>
                  <Input
                    value={editingClient.client_name}
                    onChange={(e) =>
                      setEditingClient({ ...editingClient, client_name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Client Type *</Label>
                  <Select
                    value={editingClient.client_type}
                    onValueChange={(value: 'buyer' | 'seller') =>
                      setEditingClient({ ...editingClient, client_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buyer">Buyer</SelectItem>
                      <SelectItem value="seller">Seller</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={editingClient.phone || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    value={editingClient.email || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Stage *</Label>
                  <Select
                    value={editingClient.stage.toString()}
                    onValueChange={(value) =>
                      setEditingClient({ ...editingClient, stage: parseInt(value) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(stageLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Source</Label>
                  <Select
                    value={editingClient.source || ''}
                    onValueChange={(value) => setEditingClient({ ...editingClient, source: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_OPTIONS.map((source) => (
                        <SelectItem key={source} value={source}>
                          {source}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Projected Sale Amount</Label>
                  <Input
                    type="number"
                    value={editingClient.projected_sale_amount || ''}
                    onChange={(e) =>
                      setEditingClient({
                        ...editingClient,
                        projected_sale_amount: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Commission %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={editingClient.commission_percent || ''}
                    onChange={(e) =>
                      setEditingClient({
                        ...editingClient,
                        commission_percent: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Split %</Label>
                  <Input
                    type="number"
                    step="1"
                    value={editingClient.split_percent || ''}
                    onChange={(e) =>
                      setEditingClient({
                        ...editingClient,
                        split_percent: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Expected Pending Date</Label>
                <Input
                  type="date"
                  value={editingClient.expected_pending_date || ''}
                  onChange={(e) =>
                    setEditingClient({ ...editingClient, expected_pending_date: e.target.value })
                  }
                />
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={editingClient.notes || ''}
                  onChange={(e) => setEditingClient({ ...editingClient, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Projected GCI:</span>
                  <span className="text-xl font-bold text-green-400">
                    {formatCurrency(calculateGCI(editingClient.projected_sale_amount, editingClient.commission_percent, editingClient.split_percent))}
                  </span>
                </div>
              </div>

              <Button onClick={handleUpdateClient} className="w-full bg-gold hover:bg-gold/90">
                Update Client
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pipeline;
