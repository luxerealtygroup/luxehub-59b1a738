import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Pencil } from 'lucide-react';
import { sendPortalInvite } from '@/lib/inviteLinks';
import { supabase } from '@/integrations/supabase/client';
import { isValidEmail } from '@/lib/validation/email';

export interface InviteTarget {
  portalId: string;
  clientName: string | null;
  email: string;
  agentName?: string | null;
  /** True once a client has signed up on this portal — address is then fixed. */
  claimed?: boolean;
}

interface Props {
  /** The portal awaiting a decision, or null when nothing is pending. */
  target: InviteTarget | null;
  onClose: () => void;
  /** Fires only after an invitation was actually sent. */
  onSent?: (target: InviteTarget) => void;
  /** Fires after the portal's email address was corrected and saved. */
  onEmailChanged?: (portalId: string, email: string) => void;
}

/**
 * Asked every time a portal is created: send the invitation now, or not yet.
 *
 * Dismissing the dialog in any way (Esc, outside click, "Not yet") sends
 * nothing, mints no token and writes nothing to Follow Up Boss.
 */
export function SendInviteConfirmDialog({ target, onClose, onSent, onEmailChanged }: Props) {
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState(target?.email ?? '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setEmail(target?.email ?? '');
    setEditing(false);
    setDraft('');
  }, [target?.portalId, target?.email]);

  /**
   * Correcting the address changes it on the portal record itself. Any invite
   * already outstanding is bound to the old address and would be refused, so
   * it is voided and its activation link is wiped from Follow Up Boss first.
   */
  const saveEmail = async () => {
    if (!target || savingEmail) return;
    const next = draft.trim().toLowerCase();
    if (!isValidEmail(next)) {
      toast({
        title: 'Enter a valid email address',
        description: 'The client needs a real address to receive their invitation.',
        variant: 'destructive',
      });
      return;
    }
    if (next === email.trim().toLowerCase()) {
      setEditing(false);
      return;
    }
    setSavingEmail(true);
    try {
      // Clear first, while the Follow Up Boss match still uses the old address.
      await supabase.functions
        .invoke('portal-fub-link', { body: { portalId: target.portalId, clearActivation: true } })
        .catch((e) => console.warn('Could not clear the activation link in Follow Up Boss:', e));

      const { error } = await supabase
        .from('client_accounts')
        .update({
          email: next,
          invite_token: null,
          invite_expires_at: null,
          invite_used_at: null,
          invited_at: null,
        })
        .eq('id', target.portalId);
      if (error) throw new Error(error.message);

      setEmail(next);
      setEditing(false);
      onEmailChanged?.(target.portalId, next);
      toast({
        title: 'Email updated',
        description: 'Any earlier invitation link for this client no longer works.',
      });
    } catch (err) {
      toast({
        title: 'Could not update the email',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingEmail(false);
    }
  };

  const send = async () => {
    if (!target || sending || editing) return; // guards a double-click
    setSending(true);
    try {
      await sendPortalInvite({
        portalId: target.portalId,
        email,
        clientName: target.clientName,
        agentName: target.agentName,
      });
      toast({
        title: 'Invitation sent',
        description: `${email} will receive a single-use activation link, valid for 30 days.`,
      });
      onSent?.({ ...target, email });
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

  const busy = sending || savingEmail;

  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send the invitation now?</DialogTitle>
          <DialogDescription>
            The portal is created either way. Check the address below before sending — the link only
            works for this exact email.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2">
          <p className="font-medium">{target?.clientName || 'This client'}</p>
          {editing ? (
            <div className="space-y-2">
              <Input
                type="email"
                value={draft}
                autoFocus
                maxLength={255}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveEmail();
                  }
                }}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEmail} disabled={savingEmail}>
                  {savingEmail && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                  disabled={savingEmail}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground break-all">{email}</span>
              {!target?.claimed && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={() => {
                    setDraft(email);
                    setEditing(true);
                  }}
                >
                  <Pencil className="mr-1 h-3 w-3" />
                  Edit email
                </Button>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Not yet
          </Button>
          <Button onClick={send} disabled={busy || editing} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send invitation now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
