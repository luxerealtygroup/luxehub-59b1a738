import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, History } from 'lucide-react';

export const CMA_STATUSES = [
  'CMA Created',
  'Listing Appointment Scheduled',
  'Listing Signed',
  'Active',
  'Sold',
  'Expired / Lost',
] as const;

export type CMAStatus = typeof CMA_STATUSES[number];

const statusColors: Record<string, string> = {
  'CMA Created': 'bg-muted text-muted-foreground',
  'Listing Appointment Scheduled': 'bg-amber-500/20 text-amber-500',
  'Listing Signed': 'bg-blue-500/20 text-blue-500',
  'Active': 'bg-emerald-500/20 text-emerald-500',
  'Sold': 'bg-green-600/20 text-green-600',
  'Expired / Lost': 'bg-destructive/20 text-destructive',
};

interface CMALifecycleStatusProps {
  reportId: string;
  currentStatus: string;
  finalListPrice: number | null;
  finalSoldPrice: number | null;
  lifecycleHistory: Array<{ status: string; at: string }>;
  onUpdate: () => void;
}

const CMALifecycleStatus = ({
  reportId,
  currentStatus,
  finalListPrice,
  finalSoldPrice,
  lifecycleHistory,
  onUpdate,
}: CMALifecycleStatusProps) => {
  const [newStatus, setNewStatus] = useState(currentStatus);
  const [listPrice, setListPrice] = useState(finalListPrice?.toString() || '');
  const [soldPrice, setSoldPrice] = useState(finalSoldPrice?.toString() || '');
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const handleSave = async () => {
    if (newStatus === currentStatus && !listPrice && !soldPrice) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = { listing_status: newStatus };

      // Set timestamps based on status
      if (newStatus !== currentStatus) {
        if (newStatus === 'Listing Signed') updates.listing_signed_at = now;
        if (newStatus === 'Active') updates.listing_active_at = now;
        if (newStatus === 'Sold') updates.listing_sold_at = now;

        // Append to lifecycle history
        const newHistory = [...lifecycleHistory, { status: newStatus, at: now }];
        updates.lifecycle_history = newHistory;
      }

      if (listPrice) updates.final_list_price = parseFloat(listPrice);
      if (soldPrice) updates.final_sold_price = parseFloat(soldPrice);

      const { error } = await supabase
        .from('cma_reports')
        .update(updates as any)
        .eq('id', reportId);

      if (error) throw error;
      toast.success('Lifecycle status updated');
      onUpdate();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-gold/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Listing Lifecycle</CardTitle>
          <CMAStatusBadge status={currentStatus} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground">Update Status</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CMA_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(newStatus === 'Active' || newStatus === 'Listing Signed' || newStatus === 'Sold') && (
            <div>
              <Label className="text-xs text-muted-foreground">Final List Price</Label>
              <Input
                type="number"
                value={listPrice}
                onChange={e => setListPrice(e.target.value)}
                placeholder="List price"
              />
            </div>
          )}
          {newStatus === 'Sold' && (
            <div>
              <Label className="text-xs text-muted-foreground">Sold Price</Label>
              <Input
                type="number"
                value={soldPrice}
                onChange={e => setSoldPrice(e.target.value)}
                placeholder="Sold price"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || newStatus === currentStatus && !listPrice && !soldPrice}
            className="bg-gold hover:bg-gold/90 text-gold-foreground"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
          {lifecycleHistory.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
              <History className="h-4 w-4 mr-1" /> History ({lifecycleHistory.length})
            </Button>
          )}
        </div>

        {showHistory && lifecycleHistory.length > 0 && (
          <div className="border-t border-border pt-3 space-y-1">
            {lifecycleHistory.map((entry, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <CMAStatusBadge status={entry.status} />
                <span className="text-muted-foreground">
                  {new Date(entry.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const CMAStatusBadge = ({ status }: { status: string }) => (
  <Badge variant="outline" className={`text-[10px] ${statusColors[status] || 'bg-muted text-muted-foreground'}`}>
    {status}
  </Badge>
);

export default CMALifecycleStatus;
