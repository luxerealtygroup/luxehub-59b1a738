import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Loader2 } from 'lucide-react';

type Mode = 'client' | 'agent' | 'owner';

interface Props {
  /** Where to land after the account is gone. */
  signInPath?: string;
}

const SUPPORT_EMAIL = 'info@luxerealtygroup.ca';

const DeleteAccountCard = ({ signInPath = '/login' }: Props) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('client');
  const [orgName, setOrgName] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmation('');
    setLoadingInfo(true);
    (async () => {
      const { data, error } = await supabase.functions.invoke('delete-my-account', {
        body: { dryRun: true },
      });
      if (!error && data) {
        setMode((data.mode as Mode) ?? 'client');
        setOrgName(data.orgName ?? null);
        setOwnerName(data.ownerName ?? null);
      }
      setLoadingInfo(false);
    })();
  }, [open]);

  const expected = mode === 'owner' ? (orgName ?? '') : 'DELETE';
  const canConfirm =
    !loadingInfo && expected.length > 0 && confirmation.trim().toLowerCase() === expected.toLowerCase();

  const handleDelete = async () => {
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke('delete-my-account', {
      body: { confirmation: confirmation.trim() },
    });
    if (error || !data?.ok) {
      setDeleting(false);
      toast({
        title: 'We could not delete your account',
        description: `Nothing was changed. Please contact ${SUPPORT_EMAIL} and we will help.`,
        variant: 'destructive',
      });
      return;
    }
    await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined);
    toast({ title: 'Your account has been deleted.' });
    setOpen(false);
    navigate(signInPath, { replace: true });
  };

  return (
    <>
      <Card className="border-destructive/50 max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete my account
          </CardTitle>
          <CardDescription>
            This permanently deletes your LUXEhub account and signs you out on every device. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Delete my account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => !deleting && setOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground pt-2">
                {loadingInfo ? (
                  <p className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking what this will remove…
                  </p>
                ) : mode === 'client' ? (
                  <>
                    <p>Your sign-in is removed and you will no longer be able to open your portal.</p>
                    <p>
                      The transaction records your agent keeps for their own files are not affected — your portal simply
                      goes back to having no client login.
                    </p>
                  </>
                ) : mode === 'agent' ? (
                  <>
                    <p>Your sign-in, your profile and your personal activity history are removed.</p>
                    <p>
                      Your clients, their portals, your transactions, deals and open houses stay with the business and
                      move to {ownerName ? <strong>{ownerName}</strong> : 'the hub owner'}.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-destructive font-medium">
                      This deletes your hub and every account in it, including your agents' accounts and your clients'
                      portals.
                    </p>
                    <p>
                      Everything belonging to {orgName ? <strong>{orgName}</strong> : 'your hub'} — clients, portals,
                      documents, transactions and reports — is permanently removed. Nothing is retained.
                    </p>
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm">
              Type <span className="font-semibold text-foreground">{expected || '…'}</span> to confirm.
            </p>
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={expected}
              autoComplete="off"
              disabled={loadingInfo || deleting}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!canConfirm || deleting}>
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting…
                </>
              ) : (
                'Permanently delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DeleteAccountCard;
