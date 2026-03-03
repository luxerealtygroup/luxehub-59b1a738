import { useEffect, useState, useRef } from 'react';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Printer, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/utils';

interface PipelineReportProps {
  onClose: () => void;
}

interface ReportDeal {
  id: number;
  clientName: string;
  agentName: string;
  propertyAddress: string;
  price: number;
  gci: number;
  expectedClose: string | null;
  stage: 'pending' | 'conditional';
}

const PipelineReport = ({ onClose }: PipelineReportProps) => {
  const [deals, setDeals] = useState<ReportDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchDeals = async () => {
      const response = await followUpBossApi.getDeals(200, 0);
      if (response.success && response.data?.deals) {
        const reportDeals: ReportDeal[] = response.data.deals
          .filter((d: FUBDeal) => 
            d.stageName?.toLowerCase() === 'pending' || 
            d.stageName?.toLowerCase() === 'offer'
          )
          .map((d: FUBDeal) => ({
            id: d.id,
            clientName: d.people?.[0]?.name || d.name || 'Unknown Client',
            agentName: d.users?.[0]?.name || 'Unassigned',
            propertyAddress: [d.propertyStreet, d.propertyCity, d.propertyState]
              .filter(Boolean)
              .join(', ') || 'Address TBD',
            price: d.price || 0,
            gci: d.commissionValue || 0,
            expectedClose: d.projectedCloseDate,
            stage: d.stageName?.toLowerCase() === 'pending' ? 'pending' : 'conditional',
          }));
        
        setDeals(reportDeals.sort((a, b) => {
          if (a.stage !== b.stage) return a.stage === 'pending' ? -1 : 1;
          return a.agentName.localeCompare(b.agentName);
        }));
      }
      setLoading(false);
    };

    fetchDeals();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const pendingDeals = deals.filter(d => d.stage === 'pending');
  const conditionalDeals = deals.filter(d => d.stage === 'conditional');

  const pendingTotal = pendingDeals.reduce((sum, d) => sum + d.gci, 0);
  const conditionalTotal = conditionalDeals.reduce((sum, d) => sum + d.gci, 0);
  
  // Company revenue = 30% of GCI (agent gets 70%)
  const pendingRevenue = pendingTotal * 0.30;
  const conditionalRevenue = conditionalTotal * 0.30;
  const totalRevenue = pendingRevenue + conditionalRevenue;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <Card className="w-full max-w-4xl mx-4">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gold" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 overflow-auto">
      <div className="container max-w-5xl mx-auto py-8 px-4">
        {/* Screen-only controls */}
        <div className="flex justify-between items-center mb-4 print:hidden">
          <h1 className="text-2xl font-bold text-foreground">Pipeline Report</h1>
          <div className="flex gap-2">
            <Button onClick={handlePrint} className="bg-gold hover:bg-gold/90">
              <Printer className="h-4 w-4 mr-2" />
              Print Report
            </Button>
            <Button variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
          </div>
        </div>

        {/* Printable Report */}
        <div ref={printRef} className="bg-white text-black print:bg-white">
          {/* Report Header */}
          <div className="text-center mb-8 print:mb-6">
            <h1 className="text-3xl font-bold mb-2 print:text-2xl">Pipeline Report</h1>
            <p className="text-muted-foreground print:text-gray-600">
              Generated: {format(new Date(), 'MMMM d, yyyy h:mm a')}
            </p>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-8 print:mb-6">
            <Card className="print:border print:border-gray-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Pending Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gold print:text-amber-600">
                  {pendingDeals.length} deals
                </div>
                <p className="text-muted-foreground print:text-gray-600">
                  {formatCurrency(pendingTotal)} GCI
                </p>
              </CardContent>
            </Card>
            <Card className="print:border print:border-gray-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Conditional Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {conditionalDeals.length} deals
                </div>
                <p className="text-muted-foreground print:text-gray-600">
                  {formatCurrency(conditionalTotal)} GCI
                </p>
              </CardContent>
            </Card>
            <Card className="print:border print:border-gray-300 bg-green-50 print:bg-green-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Projected Company Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(totalRevenue)}
                </div>
                <p className="text-sm text-muted-foreground print:text-gray-600">
                  Pending: {formatCurrency(pendingRevenue)} | Conditional: {formatCurrency(conditionalRevenue)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Pending Sales Table */}
          {pendingDeals.length > 0 && (
            <div className="mb-8 print:mb-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Badge className="bg-gold hover:bg-gold print:bg-amber-100 print:text-amber-800">Pending</Badge>
                Pending Sales ({pendingDeals.length})
              </h2>
              <Table>
                <TableHeader>
                  <TableRow className="print:border-b print:border-gray-300">
                    <TableHead className="print:text-gray-700">Agent</TableHead>
                    <TableHead className="print:text-gray-700">Client</TableHead>
                    <TableHead className="print:text-gray-700">Property</TableHead>
                    <TableHead className="text-right print:text-gray-700">Price</TableHead>
                    <TableHead className="text-right print:text-gray-700">GCI</TableHead>
                    <TableHead className="print:text-gray-700">Expected Close</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingDeals.map((deal) => (
                    <TableRow key={deal.id} className="print:border-b print:border-gray-200">
                      <TableCell className="font-medium">{deal.agentName}</TableCell>
                      <TableCell>{deal.clientName}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{deal.propertyAddress}</TableCell>
                      <TableCell className="text-right">{formatCurrency(deal.price)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(deal.gci)}</TableCell>
                      <TableCell>
                        {deal.expectedClose 
                          ? format(parseISO(deal.expectedClose), 'MMM d, yyyy')
                          : 'TBD'}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold bg-muted/50 print:bg-gray-100">
                    <TableCell colSpan={4}>Total Pending</TableCell>
                    <TableCell className="text-right">{formatCurrency(pendingTotal)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          {/* Conditional Sales Table */}
          {conditionalDeals.length > 0 && (
            <div className="mb-8 print:mb-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Badge variant="secondary" className="bg-blue-100 text-blue-800 print:bg-blue-100">Conditional</Badge>
                Conditional Sales ({conditionalDeals.length})
              </h2>
              <Table>
                <TableHeader>
                  <TableRow className="print:border-b print:border-gray-300">
                    <TableHead className="print:text-gray-700">Agent</TableHead>
                    <TableHead className="print:text-gray-700">Client</TableHead>
                    <TableHead className="print:text-gray-700">Property</TableHead>
                    <TableHead className="text-right print:text-gray-700">Price</TableHead>
                    <TableHead className="text-right print:text-gray-700">GCI</TableHead>
                    <TableHead className="print:text-gray-700">Expected Close</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conditionalDeals.map((deal) => (
                    <TableRow key={deal.id} className="print:border-b print:border-gray-200">
                      <TableCell className="font-medium">{deal.agentName}</TableCell>
                      <TableCell>{deal.clientName}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{deal.propertyAddress}</TableCell>
                      <TableCell className="text-right">{formatCurrency(deal.price)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(deal.gci)}</TableCell>
                      <TableCell>
                        {deal.expectedClose 
                          ? format(parseISO(deal.expectedClose), 'MMM d, yyyy')
                          : 'TBD'}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold bg-muted/50 print:bg-gray-100">
                    <TableCell colSpan={4}>Total Conditional</TableCell>
                    <TableCell className="text-right">{formatCurrency(conditionalTotal)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          {/* Grand Total */}
          <Card className="print:border print:border-gray-300">
            <CardContent className="py-4">
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Total Pipeline GCI</span>
                <span className="text-gold print:text-amber-600">
                  {formatCurrency(pendingTotal + conditionalTotal)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PipelineReport;
