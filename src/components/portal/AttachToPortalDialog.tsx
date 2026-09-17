import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Link2 } from 'lucide-react';

interface PortalOption {
  id: string;
  full_name: string | null;
  email: string;
  client_type: string | null;
}

interface AttachToPortalDialogProps {
  /** The pipeline client record being attached. */
  pipelineClientId: string;
  clientName: string;
  trigger: React.ReactNode;
  onAttached?: () => void;
}

/**
 * Attaches an existing client record to a portal that already belongs to those
 * people. One portal can hold several records (a sale and a purchase); a record
 * can only ever belong to one portal, which is what stops duplicate portals.
 */
export function AttachToPortalDialog({
  pipelineClientId,
  clientName,
  trigger,
  onAttached,
}: AttachToPortalDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [portals, setPortals] = useState<PortalOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from('client_accounts')
      .select('id,full_name,email,client_type')
      .order('full_name')
      .then(({ data }) => {
        setPortals((data ?? []) as PortalOption[]);
        setLoading(false);
      });
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return portals;
    return portals.filter((p) =>
      `${p.full_name ?? ''} ${p.email}`.toLowerCase().includes(q),
    );
  }, [portals, search]);

  const attach = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase
      .from('pipeline_clients')
      .update({ portal_id: selected })
      .eq('id', pipelineClientId);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not attach', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Attached', description: `${clientName} now sits under their existing portal.` });
    setOpen(false);
    setSelected(null);
    onAttached?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Attach to an existing portal</DialogTitle>
          <DialogDescription>
            Pick the portal that already belongs to {clientName}. Their new deal will appear there
            instead of creating a second portal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="portal-search">Search portals</Label>
            <Input
              id="portal-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or email"
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/50">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading portals…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No portals match.</div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p.id)}
                  aria-pressed={selected === p.id}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                    selected === p.id ? 'bg-primary/10' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="font-medium">{p.full_name || p.email}</div>
                  <div className="text-xs text-muted-foreground">{p.email}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={attach} disabled={!selected || saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Attach
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
