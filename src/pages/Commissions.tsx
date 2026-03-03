import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { DollarSign, TrendingUp, Clock, CheckCircle, Plus, Search, Loader2, Download, Users, X, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { FUBClientSearch } from '@/components/FUBClientSearch';
import { useToast } from '@/hooks/use-toast';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { formatCurrency, formatNumber } from '@/lib/utils';

import { parseISO } from 'date-fns';

interface Commission {
  id: string;
  created_at: string;
  amount: number;
  status: 'pending' | 'paid';
  transaction_side: 'buy' | 'sell';
  deals?: {
    client_name: string;
    property_address: string;
  };
}

interface FUBDealDisplay {
  id: number;
  clientName: string;
  propertyAddress: string;
  stageName: string;
  dealValue: number;
  grossCommission: number;
  createdAt: string;
  status: string;
  source: string;
}

const Commissions = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { hasRole } = useUserRole();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [fubDeals, setFUBDeals] = useState<FUBDeal[]>([]);
  const [fubDealsDisplay, setFUBDealsDisplay] = useState<FUBDealDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [fubLoading, setFubLoading] = useState(false);
  const [addDealOpen, setAddDealOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncToFUB, setSyncToFUB] = useState(false);
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newDeal, setNewDeal] = useState({
    client_name: '',
    property_address: '',
    stage: 'pending',
    deal_value: 0,
    commission_percent: 2.5,
    split_percent: 50,
    gross_commission: 0,
    transaction_side: 'buy',
    source: 'manual',
    conditions: [] as { date: string; description: string }[],
  });

  const { calendarConnected, checkCalendarConnection, addEventToCalendar } = useGoogleCalendar();

  useEffect(() => {
    checkCalendarConnection();
  }, [checkCalendarConnection]);

  useEffect(() => {
    const fetchCommissions = async () => {
      try {
        const { data, error } = await supabase
          .from('commissions')
          .select('*, deals(client_name, property_address)')
          .eq('user_id', user?.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching commissions:', error);
        } else {
          setCommissions(data || []);
        }
      } catch (error) {
        console.error('Unexpected error fetching commissions:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchCommissions();
    }
  }, [user]);

  useEffect(() => {
    const fetchFUBDeals = async () => {
      if (!hasRole('admin')) return;
      setFubLoading(true);
      try {
        const response = await followUpBossApi.getDeals(200, 0);
        if (response.success && response.data?.deals) {
          setFUBDeals(response.data.deals);
        } else {
          toast({
            title: 'Error fetching deals from Follow Up Boss',
            description: response.error || 'Unknown error',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Error fetching FUB deals:', error);
        toast({
          title: 'Error fetching deals from Follow Up Boss',
          description: 'Could not connect to Follow Up Boss',
          variant: 'destructive',
        });
      } finally {
        setFubLoading(false);
      }
    };

    fetchFUBDeals();
  }, [hasRole, toast]);

  useEffect(() => {
    const displayDeals = fubDeals
      .filter((deal) => deal.agentCommission)
      .map((deal) => ({
        id: deal.id,
        clientName: deal.people?.[0]?.name || deal.name || 'Unknown Client',
        propertyAddress: [deal.propertyStreet, deal.propertyCity, deal.propertyState]
          .filter(Boolean)
          .join(', ') || 'Address TBD',
        stageName: deal.stageName || 'Unknown Stage',
        dealValue: deal.price || 0,
        grossCommission: deal.agentCommission || 0,
        createdAt: deal.createdAt || '',
        status: deal.stageName || 'Unknown',
        source: 'fub',
      }));

    setFUBDealsDisplay(displayDeals);
  }, [fubDeals]);

  const fetchMyFUBDeals = async () => {
    setFubLoading(true);
    try {
      const response = await followUpBossApi.getDeals(200, 0);
      if (response.success && response.data?.deals) {
        const myDeals = response.data.deals.filter((deal) =>
          deal.users?.some((u) => u.email === user?.email)
        );

        const displayDeals = myDeals
          .filter((deal) => deal.agentCommission)
          .map((deal) => ({
            id: deal.id,
            clientName: deal.people?.[0]?.name || deal.name || 'Unknown Client',
            propertyAddress: [deal.propertyStreet, deal.propertyCity, deal.propertyState]
              .filter(Boolean)
              .join(', ') || 'Address TBD',
            stageName: deal.stageName || 'Unknown Stage',
            dealValue: deal.price || 0,
            grossCommission: deal.agentCommission || 0,
            createdAt: deal.createdAt || '',
            status: deal.stageName || 'Unknown',
            source: 'fub',
          }));

        setFUBDealsDisplay(displayDeals);
      } else {
        toast({
          title: 'Error fetching deals from Follow Up Boss',
          description: response.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error fetching FUB deals:', error);
      toast({
        title: 'Error fetching deals from Follow Up Boss',
        description: 'Could not connect to Follow Up Boss',
        variant: 'destructive',
      });
    } finally {
      setFubLoading(false);
    }
  };

  const totalEarned = commissions
    .filter((comm) => comm.status === 'paid')
    .reduce((sum, comm) => sum + comm.amount, 0);

  const totalPending = commissions
    .filter((comm) => comm.status === 'pending')
    .reduce((sum, comm) => sum + comm.amount, 0);

  const totalConditional = fubDealsDisplay
    .filter((deal) => deal.status.toLowerCase() === 'offer')
    .reduce((sum, deal) => sum + deal.grossCommission, 0);

  const thisMonth = commissions
    .filter(
      (comm) => new Date(comm.created_at).getMonth() === new Date().getMonth()
    )
    .reduce((sum, comm) => sum + comm.amount, 0);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewDeal((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (
    e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
  ) => {
    const { name, value } = e.target as HTMLSelectElement;
    setNewDeal((prev) => ({ ...prev, [name]: value }));
  };

  const calculateGCI = (
    salePrice: number | string,
    commissionRate: number | string,
    splitPercent: number | string
  ) => {
    const sale = typeof salePrice === 'string' ? parseFloat(salePrice) : salePrice;
    const rate = typeof commissionRate === 'string' ? parseFloat(commissionRate) : commissionRate;
    const split = typeof splitPercent === 'string' ? parseFloat(splitPercent) : splitPercent;

    const commission = (sale * (rate / 100) * (split / 100)) || 0;
    setNewDeal((prev) => ({ ...prev, gross_commission: commission }));
    return commission;
  };

  const netPreview =
    newDeal.gross_commission -
    (newDeal.gross_commission * (user?.user_metadata?.cap_rate || 0)) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: dealData, error: dealError } = await supabase
        .from('deals')
        .insert([
          {
            client_name: newDeal.client_name,
            property_address: newDeal.property_address,
            stage: newDeal.stage,
            deal_value: newDeal.deal_value,
            commission_percent: newDeal.commission_percent,
            split_percent: newDeal.split_percent,
            user_id: user?.id,
            source: newDeal.source,
          },
        ])
        .select()
        .single();

      if (dealError) {
        console.error('Error adding deal:', dealError);
        toast({
          title: 'Error adding deal',
          description: dealError.message,
          variant: 'destructive',
        });
        return;
      }

      const { data: commissionData, error: commissionError } = await supabase
        .from('commissions')
        .insert([
          {
            amount: newDeal.gross_commission,
            status: newDeal.stage === 'closed' ? 'paid' : 'pending',
            transaction_side: newDeal.transaction_side,
            user_id: user?.id,
            deal_id: dealData?.id,
          },
        ])
        .select()
        .single();

      if (commissionError) {
        console.error('Error adding commission:', commissionError);
        toast({
          title: 'Error adding commission',
          description: commissionError.message,
          variant: 'destructive',
        });
        return;
      }

      if (newDeal.stage === 'offer' && newDeal.conditions.length > 0 && addToCalendar) {
        newDeal.conditions.forEach(async (condition) => {
          await addEventToCalendar({
            summary: `${newDeal.client_name} - ${condition.description}`,
            description: `Condition deadline for ${newDeal.client_name} at ${newDeal.property_address}`,
            start: condition.date,
            end: condition.date,
          });
        });
      }

      setCommissions((prev) => [
        ...prev,
        {
          id: commissionData?.id,
          created_at: commissionData?.created_at,
          amount: newDeal.gross_commission,
          status: newDeal.stage === 'closed' ? 'paid' : 'pending',
          transaction_side: newDeal.transaction_side,
          deals: {
            client_name: newDeal.client_name,
            property_address: newDeal.property_address,
          },
        },
      ]);

      setNewDeal({
        client_name: '',
        property_address: '',
        stage: 'pending',
        deal_value: 0,
        commission_percent: 2.5,
        split_percent: 50,
        gross_commission: 0,
        transaction_side: 'buy',
        source: 'manual',
        conditions: [],
      });

      setAddDealOpen(false);
      toast({
        title: 'Deal and commission added successfully!',
        description: `Added deal for ${newDeal.client_name} and commission of $${newDeal.gross_commission}`,
      });
    } catch (error: any) {
      console.error('Error adding deal and commission:', error);
      toast({
        title: 'Error adding deal and commission',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
      setSyncToFUB(false);
      setAddToCalendar(false);
    }
  };

  const importFUBDeal = async (deal: FUBDeal) => {
    setSubmitting(true);
    try {
      const { data: dealData, error: dealError } = await supabase
        .from('deals')
        .insert([
          {
            client_name: deal.people?.[0]?.name || deal.name || 'Unknown Client',
            property_address: [deal.propertyStreet, deal.propertyCity, deal.propertyState]
              .filter(Boolean)
              .join(', ') || 'Address TBD',
            stage: deal.stageName?.toLowerCase() === 'pending' ? 'pending' : 'closed',
            deal_value: deal.price || 0,
            commission_percent: 2.5,
            split_percent: 50,
            user_id: user?.id,
            source: 'fub',
          },
        ])
        .select()
        .single();

      if (dealError) {
        console.error('Error adding deal:', dealError);
        toast({
          title: 'Error adding deal',
          description: dealError.message,
          variant: 'destructive',
        });
        return;
      }

      const { data: commissionData, error: commissionError } = await supabase
        .from('commissions')
        .insert([
          {
            amount: deal.agentCommission || 0,
            status: deal.stageName?.toLowerCase() === 'pending' ? 'pending' : 'paid',
            transaction_side: 'buy',
            user_id: user?.id,
            deal_id: dealData?.id,
          },
        ])
        .select()
        .single();

      if (commissionError) {
        console.error('Error adding commission:', commissionError);
        toast({
          title: 'Error adding commission',
          description: commissionError.message,
          variant: 'destructive',
        });
        return;
      }

      setCommissions((prev) => [
        ...prev,
        {
          id: commissionData?.id,
          created_at: commissionData?.created_at,
          amount: deal.agentCommission || 0,
          status: deal.stageName?.toLowerCase() === 'pending' ? 'pending' : 'paid',
          transaction_side: 'buy',
          deals: {
            client_name: deal.people?.[0]?.name || deal.name || 'Unknown Client',
            property_address: [deal.propertyStreet, deal.propertyCity, deal.propertyState]
              .filter(Boolean)
              .join(', ') || 'Address TBD',
          },
        },
      ]);

      toast({
        title: 'Deal and commission added successfully!',
        description: `Added deal for ${deal.people?.[0]?.name || deal.name || 'Unknown Client'} and commission of $${deal.agentCommission || 0}`,
      });
    } catch (error: any) {
      console.error('Error adding deal and commission:', error);
      toast({
        title: 'Error adding deal and commission',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredFUBDeals = fubDealsDisplay.filter((deal) =>
    deal.clientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Commissions</h1>
        <div>
          <Dialog open={addDealOpen} onOpenChange={setAddDealOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Manual Deal
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>Add Deal & Commission</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="client_name" className="text-right">
                    Client Name
                  </Label>
                  <Input
                    type="text"
                    id="client_name"
                    name="client_name"
                    value={newDeal.client_name}
                    onChange={handleInputChange}
                    className="col-span-3"
                    required
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="property_address" className="text-right">
                    Property Address
                  </Label>
                  <Input
                    type="text"
                    id="property_address"
                    name="property_address"
                    value={newDeal.property_address}
                    onChange={handleInputChange}
                    className="col-span-3"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="stage" className="text-right">
                    Stage
                  </Label>
                  <Select
                    name="stage"
                    onValueChange={(value) =>
                      setNewDeal((prev) => ({ ...prev, stage: value }))
                    }
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="offer">Offer</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="transaction_side" className="text-right">
                    Transaction Side
                  </Label>
                  <Select
                    name="transaction_side"
                    onValueChange={(value) =>
                      setNewDeal((prev) => ({ ...prev, transaction_side: value }))
                    }
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select side" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buy">Buy</SelectItem>
                      <SelectItem value="sell">Sell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="deal_value" className="text-right">
                    Deal Value
                  </Label>
                  <Input
                    type="number"
                    id="deal_value"
                    name="deal_value"
                    value={newDeal.deal_value}
                    onChange={handleInputChange}
                    className="col-span-3"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="commission_percent" className="text-right">
                    Commission (%)
                  </Label>
                  <Input
                    type="number"
                    id="commission_percent"
                    name="commission_percent"
                    value={newDeal.commission_percent}
                    onChange={(e) => {
                      handleInputChange(e);
                      calculateGCI(
                        newDeal.deal_value,
                        e.target.value,
                        newDeal.split_percent
                      );
                    }}
                    className="col-span-3"
                    required
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="split_percent" className="text-right">
                    Split (%)
                  </Label>
                  <Input
                    type="number"
                    id="split_percent"
                    name="split_percent"
                    value={newDeal.split_percent}
                    onChange={(e) => {
                      handleInputChange(e);
                      calculateGCI(
                        newDeal.deal_value,
                        newDeal.commission_percent,
                        e.target.value
                      );
                    }}
                    className="col-span-3"
                    required
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="gross_commission" className="text-right">
                    Gross Commission
                  </Label>
                  <div className="col-span-3 pt-2 border-t border-gold/20">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Net After Cap:</span>
                      <span className="text-xl font-bold text-gold">{formatCurrency(netPreview)}</span>
                    </div>
                  </div>
                </div>

                {newDeal.stage === 'offer' && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      Add Condition Deadlines
                    </h4>
                    {newDeal.conditions.map((condition, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <Input
                          type="date"
                          value={condition.date}
                          onChange={(e) => {
                            const newConditions = [...newDeal.conditions];
                            newConditions[index].date = e.target.value;
                            setNewDeal({ ...newDeal, conditions: newConditions });
                          }}
                          className="w-1/3"
                        />
                        <Input
                          type="text"
                          placeholder="Description"
                          value={condition.description}
                          onChange={(e) => {
                            const newConditions = [...newDeal.conditions];
                            newConditions[index].description = e.target.value;
                            setNewDeal({ ...newDeal, conditions: newConditions });
                          }}
                          className="w-2/3"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const newConditions = [...newDeal.conditions];
                            newConditions.splice(index, 1);
                            setNewDeal({ ...newDeal, conditions: newConditions });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setNewDeal({
                          ...newDeal,
                          conditions: [
                            ...newDeal.conditions,
                            { date: '', description: '' },
                          ],
                        });
                      }}
                    >
                      Add Condition
                    </Button>
                  </div>
                )}

                <div>
                  {newDeal.stage === 'offer' && newDeal.conditions.length > 0 && calendarConnected && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="add-to-calendar"
                        checked={addToCalendar}
                        onCheckedChange={(checked) => setAddToCalendar(checked === true)}
                      />
                      <Label htmlFor="add-to-calendar" className="text-sm text-muted-foreground cursor-pointer">
                        Add condition deadlines to Google Calendar
                      </Label>
                    </div>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={submitting || !newDeal.client_name || !newDeal.gross_commission}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {syncToFUB ? 'Adding & Syncing...' : 'Adding...'}
                    </>
                  ) : (
                    'Add Deal & Commission'
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Closed (GCI)</CardTitle>
            <CheckCircle className="h-5 w-5 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">{formatCurrency(totalEarned)}</div>
          </CardContent>
        </Card>

        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending (GCI)</CardTitle>
            <Clock className="h-5 w-5 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{formatCurrency(totalPending)}</div>
          </CardContent>
        </Card>

        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conditional (GCI)</CardTitle>
            <Clock className="h-5 w-5 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-400">{formatCurrency(totalConditional)}</div>
          </CardContent>
        </Card>

        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
            <TrendingUp className="h-5 w-5 text-gold" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gold">{formatCurrency(thisMonth)}</div>
          </CardContent>
        </Card>
      </div>

      {/* FUB Transactions - Primary source */}
      <Card className="border-gold/10 bg-card/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-gold font-display">My Transactions</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMyFUBDeals}
            className="border-gold/30 text-gold hover:bg-gold/10"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">GCI</TableHead>
                  <TableHead>Closing Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fubDealsDisplay.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No deals found. Add deals in Follow Up Boss to see them here.
                    </TableCell>
                  </TableRow>
                ) : (
                  fubDealsDisplay.map((deal) => (
                    <TableRow key={deal.id}>
                      <TableCell className="font-medium">{deal.clientName}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{deal.propertyAddress}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            deal.status === 'closed'
                              ? 'border-green-500/30 text-green-400'
                              : deal.status === 'pending'
                              ? 'border-amber-500/30 text-amber-400'
                              : 'border-orange-500/30 text-orange-400'
                          }
                        >
                          {deal.stageName}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(deal.dealValue)}</TableCell>
                      <TableCell className="text-right font-bold text-gold">{formatCurrency(deal.grossCommission)}</TableCell>
                      <TableCell>
                        {deal.source === 'fub' && deal.status !== 'closed' ? (
                          format(parseISO(deal.createdAt), 'MMM d, yyyy')
                        ) : (
                          'Closed'
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Manual Transactions (Legacy) */}
      {commissions.length > 0 && (
        <Card className="border-gold/10 bg-card/50">
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-normal">Manual Entries (Legacy)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((comm) => (
                    <TableRow key={comm.id}>
                      <TableCell className="font-medium">{comm.deals?.client_name}</TableCell>
                      <TableCell>{comm.deals?.property_address || '-'}</TableCell>
                      <TableCell className="capitalize">{comm.transaction_side}</TableCell>
                      <TableCell className="text-right font-bold text-green-400">{formatCurrency(comm.amount)}</TableCell>
                      <TableCell>
                        <Badge variant={comm.status === 'paid' ? 'default' : 'secondary'} className="capitalize">
                          {comm.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(comm.created_at), 'MMM d, yyyy')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Commissions;
