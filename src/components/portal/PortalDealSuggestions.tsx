import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, X } from 'lucide-react';
import type { DealSuggestion } from '@/hooks/usePortalDealSuggestions';
import { FubDealImportDialog } from '@/components/portal/FubDealImportDialog';
import { dealAddressPrefill } from '@/lib/fubDeal';

interface Props {
  portalId: string;
  clientName?: string | null;
  suggestions: DealSuggestion[];
  onDismiss: (dealId: number, stage: string | null) => void;
  onSaved?: () => void;
}

/** Agent-only, dismissible "add this property?" prompts. Never shown to clients. */
export function PortalDealSuggestions({ portalId, clientName, suggestions, onDismiss, onSaved }: Props) {
  const [picked, setPicked] = useState<DealSuggestion | null>(null);
  if (suggestions.length === 0) return null;

  const first = (clientName || 'This client').split(' ')[0];

  return (
    <div className="space-y-2">
      {suggestions.map((s) => {
        const addr = dealAddressPrefill(s.deal);
        return (
          <div
            key={s.deal.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/[0.05] p-3"
          >
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <p className="flex-1 min-w-[16rem] text-sm">
              {s.previousStage
                ? `${first}'s FUB deal moved to ${s.deal.stageName}.`
                : `${first} has a FUB deal at ${s.deal.stageName}.`}{' '}
              {addr ? `Add “${addr}” as a property on this portal?` : 'Add it as a property on this portal?'}
            </p>
            <div className="flex items-center gap-1.5">
              <Button size="sm" onClick={() => setPicked(s)}>Add</Button>
              <Button size="sm" variant="outline" onClick={() => setPicked(s)}>Edit first</Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDismiss(s.deal.id, s.deal.stageName ?? null)}
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}

      <FubDealImportDialog
        portalId={portalId}
        deal={picked?.deal ?? null}
        open={!!picked}
        onOpenChange={(o) => !o && setPicked(null)}
        onSaved={onSaved}
      />
    </div>
  );
}
