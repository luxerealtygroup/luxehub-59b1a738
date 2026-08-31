import { useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { UserPlus, Copy, Check, Mail, Loader2 } from 'lucide-react';
import { createPortalInvite, sendPortalInvite } from '@/lib/inviteLinks';

interface ClientInviteDialogProps {
  clientName?: string;
  clientEmail?: string;
  fubPersonId?: number;
}

export function ClientInviteDialog({ clientName, clientEmail, fubPersonId }: ClientInviteDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(clientEmail || '');
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const { user } = useAuth();
  const { toast } = useToast();

  /**
   * Invites are always tied to a portal row, so the token has something to
   * unlock. Reuse the pending portal for this email if one exists.
   */
  const ensurePortal = async (): Promise<string> => {
    const normalized = email.trim().toLowerCase();
    const { data: existing } = await supabase
      .from('client_accounts')
      .select('id')
      .eq('email', normalized)
      .maybeSingle();
    if (existing?.id) return existing.id;

    const { data, error } = await supabase
      .from('client_accounts')
      .insert({
        email: normalized,
        full_name: clientName || null,
        fub_person_id: fubPersonId ?? null,
        invited_by: user?.id ?? null,
        user_id: null,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  };

  const handleCopyLink = async () => {
    if (!email) {
      toast({ title: 'Add an email', description: 'Enter the client email first.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const portalId = await ensurePortal();
      const invite = await createPortalInvite(portalId);
      setInviteLink(invite.url);
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      toast({
        title: 'Link copied!',
        description: 'Single-use invitation link, valid for 7 days.',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Could not create link',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleSendEmail = async () => {
    if (!email) {
      toast({ title: 'Add an email', description: 'Enter the client email first.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const portalId = await ensurePortal();
      const invite = await sendPortalInvite({
        portalId,
        email: email.trim().toLowerCase(),
        clientName,
        agentName: user?.email?.split('@')[0] || 'Your agent',
      });
      setInviteLink(invite.url);
      toast({ title: 'Invitation sent', description: `Emailed a single-use portal link to ${email}.` });
      setOpen(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite to Portal
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Client to Portal</DialogTitle>
          <DialogDescription>
            Generate a personalized invitation link for {clientName || 'your client'} to access their documents.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="client-email">Client Email</Label>
            <Input
              id="client-email"
              type="email"
              placeholder="client@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Invitation Link</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={inviteLink}
                className="text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Share this link with your client. They'll be able to create an account and view documents you've uploaded for them.
          </p>

          <Button
            type="button"
            onClick={handleSendEmail}
            disabled={sending || !email}
            className="w-full gap-2"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {sending ? 'Sending…' : 'Email invitation to client'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
