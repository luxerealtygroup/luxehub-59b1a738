import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface AgentOption {
  id: string;
  full_name: string | null;
}

interface Props {
  fubDealId: number;
  label: string;
  address?: string;
  onSaved?: () => void;
}

const NONE = 'none';

/**
 * Lets an admin say who actually earned a deal, and split it between two
 * agents. Follow Up Boss lists everyone attached to a deal, including the
 * operations person, so production has to be set explicitly here.
 */
export function DealSplitDialog({ fubDealId, label, address, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [primary, setPrimary] = useState<string>(NONE);
  const [secondary, setSecondary] = useState<string>(NONE);
  const [percent, setPercent] = useState<number>(100);
  const [admin, setAdmin] = useState<string>(NONE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: people }, { data: row }] = await Promise.all([
        supabase.from('profiles').select('id, full_name').order('full_name'),
        supabase
          .from('deal_metadata' as any)
          .select('producing_agent_id, producing_agent_2_id, producing_split_percent, transaction_admin_id')
          .eq('fub_deal_id', fubDealId)
          .maybeSingle(),
      ]);
      setAgents((people as AgentOption[]) || []);
      const r = row as any;
      setPrimary(r?.producing_agent_id ?? NONE);
      setSecondary(r?.producing_agent_2_id ?? NONE);
      setPercent(Number(r?.producing_split_percent ?? 100));
      setAdmin(r?.transaction_admin_id ?? NONE);
    })();
  }, [open, fubDealId]);

  const save = async () => {
    if (primary === NONE) {
      toast.error('Pick the agent who earned this deal');
      return;
    }
    if (secondary !== NONE && secondary === primary) {
      toast.error('The two agents must be different people');
      return;
    }
    const split = secondary === NONE ? 100 : Math.min(100, Math.max(0, Math.round(percent)));
    setSaving(true);
    const { error } = await supabase.from('deal_metadata' as any).upsert(
      {
        fub_deal_id: fubDealId,
        producing_agent_id: primary,
        producing_agent_2_id: secondary === NONE ? null : secondary,
        producing_split_percent: split,
        transaction_admin_id: admin === NONE ? null : admin,
      },
      { onConflict: 'fub_deal_id' },
    );
    setSaving(false);
    if (error) {
      toast.error('Could not save who earned this deal');
      return;
    }
    toast.success('Credit updated');
    setOpen(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-left hover:text-foreground transition-colors"
          title="Change who earned this deal"
        >
          <span className="truncate">{label}</span>
          <Pencil className="h-3 w-3 opacity-50" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Who earned this deal?</DialogTitle>
          <DialogDescription>{address || `Deal #${fubDealId}`}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Agent</Label>
            <Select value={primary} onValueChange={setPrimary}>
              <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.full_name || 'Unnamed'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Second agent (split)</Label>
            <Select
              value={secondary}
              onValueChange={(v) => {
                setSecondary(v);
                if (v !== NONE && percent === 100) setPercent(50);
                if (v === NONE) setPercent(100);
              }}
            >
              <SelectTrigger><SelectValue placeholder="No split" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No split</SelectItem>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.full_name || 'Unnamed'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {secondary !== NONE && (
            <div className="space-y-2">
              <Label>First agent's share (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Second agent gets {100 - Math.min(100, Math.max(0, Math.round(percent || 0)))}%.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Transaction admin (paperwork only)</Label>
            <Select value={admin} onValueChange={setAdmin}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.full_name || 'Unnamed'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Admins never receive commission credit.
            </p>
          </div>

          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DealSplitDialog;
