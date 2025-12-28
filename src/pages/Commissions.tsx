import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

interface Commission {
  id: string;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  deals: {
    client_name: string;
    property_address: string | null;
    deal_value: number | null;
  } | null;
}

const Commissions = () => {
  const { user } = useAuth();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchCommissions = async () => {
      const { data } = await supabase
        .from('commissions')
        .select(`
          *,
          deals (
            client_name,
            property_address,
            deal_value
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setCommissions(data || []);
      setLoading(false);
    };

    fetchCommissions();
  }, [user]);

  const totalEarned = commissions
    .filter(c => c.status === 'paid')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalPending = commissions
    .filter(c => c.status === 'pending')
    .reduce((sum, c) => sum + c.amount, 0);

  const thisMonth = commissions
    .filter(c => {
      const date = new Date(c.created_at);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    })
    .reduce((sum, c) => sum + c.amount, 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gold animate-pulse">Loading commissions...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Commissions</h1>
        <p className="text-muted-foreground mt-1">Track your earnings and pending payments</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Earned</CardTitle>
            <CheckCircle className="h-5 w-5 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">${totalEarned.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="h-5 w-5 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">${totalPending.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
            <TrendingUp className="h-5 w-5 text-gold" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gold">${thisMonth.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gold/10 bg-card/50">
        <CardHeader>
          <CardTitle className="text-gold font-display">Commission History</CardTitle>
        </CardHeader>
        <CardContent>
          {commissions.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="h-12 w-12 mx-auto text-gold/30 mb-4" />
              <p className="text-muted-foreground">No commissions yet</p>
              <p className="text-sm text-muted-foreground mt-1">Close deals to start earning!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gold/10">
                  <TableHead>Deal</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.map((commission) => (
                  <TableRow key={commission.id} className="border-gold/10">
                    <TableCell className="font-medium">
                      {commission.deals?.client_name || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {commission.deals?.property_address || '-'}
                    </TableCell>
                    <TableCell className="text-gold font-semibold">
                      ${commission.amount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={commission.status === 'paid' 
                          ? 'border-green-500/30 text-green-400' 
                          : 'border-amber-500/30 text-amber-400'
                        }
                      >
                        {commission.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(commission.created_at), 'MMM d, yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Commissions;
