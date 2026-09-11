import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ClipboardCheck, WifiOff } from 'lucide-react';

export interface PrepState {
  prep_kiosk_loaded: boolean | null;
  prep_signs_out: boolean | null;
  prep_qr_printed: boolean | null;
  prep_tablet_charged: boolean | null;
  prep_doors_knocked: number | null;
}

const ITEMS: { key: keyof PrepState; label: string; note?: string }[] = [
  {
    key: 'prep_kiosk_loaded',
    label: 'Open the kiosk link here while you still have signal',
    note:
      'The tablet can only work offline if the sign-in page has loaded online at least once. Open it before you go in — a basement or a rural road is too late.',
  },
  { key: 'prep_signs_out', label: 'Signs out' },
  { key: 'prep_qr_printed', label: 'QR cards printed' },
  { key: 'prep_tablet_charged', label: 'Tablet charged' },
];

export function PrepChecklist({
  openHouseId,
  prep,
  onChanged,
  canManage = true,
}: {
  openHouseId: string;
  prep: PrepState;
  onChanged: () => void;
  canManage?: boolean;
}) {
  const [local, setLocal] = useState<PrepState>(prep);
  const [doors, setDoors] = useState(prep.prep_doors_knocked?.toString() ?? '');

  useEffect(() => {
    setLocal(prep);
    setDoors(prep.prep_doors_knocked?.toString() ?? '');
  }, [openHouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch: Partial<PrepState>) => {
    setLocal((p) => ({ ...p, ...patch }));
    const { error } = await supabase.from('open_houses').update(patch).eq('id', openHouseId);
    if (error) {
      toast.error('Could not save the checklist', { description: error.message });
      setLocal(prep);
      return;
    }
    onChanged();
  };

  const doneCount =
    ITEMS.filter((i) => local[i.key] === true).length + (local.prep_doors_knocked != null ? 1 : 0);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-gold" />
        <h2 className="font-display text-lg font-semibold">Before you start</h2>
        <span className="text-sm text-muted-foreground">{doneCount}/5 done</span>
      </div>

      <div className="space-y-3">
        {ITEMS.map((item) => (
          <div key={item.key} className="flex items-start gap-3">
            <Checkbox
              id={`prep-${item.key}`}
              className="mt-0.5"
              disabled={!canManage}
              checked={local[item.key] === true}
              onCheckedChange={(v) => canManage && save({ [item.key]: !!v } as Partial<PrepState>)}
            />
            <div className="min-w-0">
              <Label htmlFor={`prep-${item.key}`} className="cursor-pointer text-sm font-medium">
                {item.label}
              </Label>
              {item.note && (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <WifiOff className="mt-0.5 h-3 w-3 shrink-0" />
                  {item.note}
                </p>
              )}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-3 pt-1">
          <Label htmlFor="prep-doors" className="text-sm font-medium">
            Doors knocked in the neighbourhood
          </Label>
          <Input
            id="prep-doors"
            type="number"
            inputMode="numeric"
            min={0}
            className="h-9 w-24"
            value={doors}
            disabled={!canManage}
            onChange={(e) => setDoors(e.target.value)}
            onBlur={() => {
              if (!canManage) return;
              const n = doors.trim() === '' ? null : Math.max(0, Math.round(Number(doors)));
              if (Number.isNaN(n as number)) return;
              if (n !== (local.prep_doors_knocked ?? null)) save({ prep_doors_knocked: n });
            }}
          />
        </div>
      </div>
    </Card>
  );
}
