import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Save, History, AlertTriangle } from 'lucide-react';
import { differenceInDays } from 'date-fns';

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

const CONFIRMATION_STATUSES = ['Listing Signed', 'Sold'];

interface CMALifecycleStatusProps {
  reportId: string;
  currentStatus: string;
  finalListPrice: number | null;
  finalSoldPrice: number | null;
  lifecycleHistory: Array<{ status: string; at: string }>;
  lostReason?: string | null;
  createdAt: string;
  onUpdate: () => void;
}

const CMALifecycleStatus = ({
  reportId,
  currentStatus,
  finalListPrice,
  finalSoldPrice,
  lifecycleHistory,
  lostReason: initialLostReason,
  createdAt,
  onUpdate,
}: CMALifecycleStatusProps) => {
  const [newStatus, setNewStatus] = useState(currentStatus);
  const [listPrice, setListPrice] = useState(finalListPrice?.toString() || '');
  const [soldPrice, setSoldPrice] = useState(finalSoldPrice?.toString() || '');
  const [lostReason, setLostReason] = useState(initialLostReason || '');
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Stale CMA check: status is still "CMA Created" and >60 days old
  const isStale =
    currentStatus === 'CMA Created' &&
    differenceInDays(new Date(), new Date(createdAt)) > 60;

  const handleSave = async () => {
    if (newStatus === currentStatus && !listPrice && !soldPrice && !lostReason) return;

    // If changing to a confirmation-required status, show dialog first
    if (newStatus !== currentStatus && CONFIRMATION_STATUSES.includes(newStatus)) {
      setShowConfirmDialog(true);
      return;
    }

    await performSave();
  };

  const performSave = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = { listing_status: newStatus };

      if (newStatus !== currentStatus) {
        if (newStatus === 'Listing Signed') updates.listing_signed_at = now;
        if (newStatus === 'Active') updates.listing_active_at = now;
        if (newStatus === 'Sold') updates.listing_sold_at = now;

        const newHistory = [...lifecycleHistory, { status: newStatus, at: now }];
        updates.lifecycle_history = newHistory;
      }

      if (listPrice) updates.final_list_price = parseFloat(listPrice);
      if (soldPrice) updates.final_sold_price = parseFloat(soldPrice);
      if (newStatus === 'Expired / Lost' && lostReason) {
        updates.lost_reason = lostReason;
      }

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
      setShowConfirmDialog(false);
    }
  };

  return (
    <>
      <Card className="border-gold/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Listing Lifecycle</CardTitle>
            <div className="flex items-center gap-2">
              {isStale && <StaleBadge />}
              <CMAStatusBadge status={currentStatus} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isStale && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>This CMA has had no lifecycle update for over 60 days. Please confirm the current status.</span>
            </div>
          )}

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

          {newStatus === 'Expired / Lost' && (
            <div>
              <Label className="text-xs text-muted-foreground">Lost Reason (optional)</Label>
              <Textarea
                value={lostReason}
                onChange={e => setLostReason(e.target.value)}
                placeholder="Why was this listing lost or expired?"
                rows={2}
                className="mt-1"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || (newStatus === currentStatus && !listPrice && !soldPrice && !(newStatus === 'Expired / Lost' && lostReason))}
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

      {/* Confirmation dialog for Listing Signed / Sold */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm CMA Origin</AlertDialogTitle>
            <AlertDialogDescription>
              You are changing the status to <span className="font-semibold text-foreground">"{newStatus}"</span>.
              Please confirm this listing originated from this CMA report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={performSave}
              className="bg-gold hover:bg-gold/90 text-gold-foreground"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Confirm & Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const CMAStatusBadge = ({ status }: { status: string }) => (
  <Badge variant="outline" className={`text-[10px] ${statusColors[status] || 'bg-muted text-muted-foreground'}`}>
    {status}
  </Badge>
);

export const StaleBadge = () => (
  <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-600 border-amber-500/30">
    <AlertTriangle className="h-3 w-3 mr-1" />
    Stale
  </Badge>
);

export default CMALifecycleStatus;
