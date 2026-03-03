import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, PenLine } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export interface ManualProductionData {
  closed_deals: number;
  pending_deals: number;
  gci_closed: number;
  gci_pending: number;
  total_volume: number;
  database_size: number;
  pipeline_count: number;
}

interface ManualProductionEntryProps {
  onSaved?: (data: ManualProductionData) => void;
}

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

export function ManualProductionEntry({ onSaved }: ManualProductionEntryProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<ManualProductionData>({
    closed_deals: 0,
    pending_deals: 0,
    gci_closed: 0,
    gci_pending: 0,
    total_volume: 0,
    database_size: 0,
    pipeline_count: 0,
  });

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: row } = await supabase
        .from('manual_production')
        .select('*')
        .eq('user_id', user.id)
        .eq('year', currentYear)
        .eq('month', currentMonth)
        .maybeSingle();

      if (row) {
        setData({
          closed_deals: row.closed_deals ?? 0,
          pending_deals: row.pending_deals ?? 0,
          gci_closed: Number(row.gci_closed) || 0,
          gci_pending: Number(row.gci_pending) || 0,
          total_volume: Number(row.total_volume) || 0,
          database_size: row.database_size ?? 0,
          pipeline_count: row.pipeline_count ?? 0,
        });
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from('manual_production')
      .upsert(
        {
          user_id: user.id,
          year: currentYear,
          month: currentMonth,
          ...data,
        },
        { onConflict: 'user_id,year,month' }
      );

    if (error) {
      toast({ title: 'Error saving production data', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Production data saved!' });
      onSaved?.(data);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Card className="border-amber-500/20 bg-gradient-to-br from-card to-amber-500/5">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </CardContent>
      </Card>
    );
  }

  const fields: { key: keyof ManualProductionData; label: string; type: 'number' | 'currency' }[] = [
    { key: 'closed_deals', label: 'Closed Deals', type: 'number' },
    { key: 'pending_deals', label: 'Pending Deals', type: 'number' },
    { key: 'gci_closed', label: 'GCI (Closed)', type: 'currency' },
    { key: 'gci_pending', label: 'GCI (Pending)', type: 'currency' },
    { key: 'total_volume', label: 'Total Volume', type: 'currency' },
    { key: 'database_size', label: 'Database Size', type: 'number' },
    { key: 'pipeline_count', label: 'Pipeline Count', type: 'number' },
  ];

  return (
    <Card className="border-amber-500/20 bg-gradient-to-br from-card to-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-amber-500 font-display flex items-center gap-2 text-base">
          <PenLine className="h-4 w-4" />
          Manual Production Entry
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {new Date(currentYear, currentMonth - 1).toLocaleString('default', { month: 'long' })} {currentYear} — Enter your production numbers below
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {fields.map(({ key, label, type }) => (
            <div key={key}>
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                type="number"
                step={type === 'currency' ? '0.01' : '1'}
                min="0"
                value={data[key] || ''}
                onChange={(e) => setData({ ...data, [key]: type === 'currency' ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0 })}
                className="mt-1"
                placeholder="0"
              />
              {type === 'currency' && data[key] > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(data[key])}</p>
              )}
            </div>
          ))}
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full bg-amber-500 hover:bg-amber-600 text-white">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Production Data
        </Button>
      </CardContent>
    </Card>
  );
}
