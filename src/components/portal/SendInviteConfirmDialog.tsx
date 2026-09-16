import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail } from 'lucide-react';
import { sendPortalInvite } from '@/lib/inviteLinks';

export interface InviteTarget {
  portalId: string;
  clientName: string | null;
  email: string;
  agentName?: string | null;
}

interface Props {
  /** The portal awaiting a decision, or null when nothing is pending. */
  target: InviteTarget | null;
  onClose: () => void;
  /** Fires only after an invitation was actually sent. */
  onSent?: (target: InviteTarget) => void;
}

/**
 * Asked every time a portal is created: send the invitation now, or not yet.
 *
 * Dismissing the dialog in any way (Esc, outside click, "Not yet") sends
 * nothing, mints no token and writes nothing to Follow Up Boss.
 */
export function SendInviteConfirmDialog({ target, onClose, onSent }: Props) {
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const send = async () => {
    if (!target || sending) return; // guards a double-click
    setSending(true);
    try {
      await sendPortalInvite({
        portalId: target.portalId,
        email: target.email,
        clientName: target.clientName,
        agentName: target.agentName,
      });
      toast({
        title: 'Invitation sent',
        description: `${target.email} will receive a single-use activation link, valid for 30 days.`,
      });
      onSent?.(target);
      onClose();
    } catch (err) {
      toast({
        title: 'Send failed',
        description: err instanceof Error ? err.message : 'Could not send the invitation.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send the invitation now?</DialogTitle>
          <DialogDescription>
            The portal is created either way. Check the address below before sending — the link only
            works for this exact email.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-1">
          <p className="font-medium">{target?.clientName || 'This client'}</p>
          <p className="text-sm text-muted-foreground break-all">{target?.email}</p>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Not yet
          </Button>
          <Button onClick={send} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send invitation now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
