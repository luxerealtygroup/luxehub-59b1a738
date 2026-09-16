import { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Loader2, MailWarning, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  DeliverResult, PortalOption, PortalPropertyOption, deliverDocumentToPortal,
  loadPortalOptions, loadPortalProperties, matchPortal, matchProperty,
} from '@/lib/portalDelivery';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** What the client will see as the document title. */
  displayName: string;
  fileName: string;
  /** Builds the PDF the client receives. Called only when the agent sends. */
  buildBlob: () => Promise<Blob> | Blob;
  /** Exactly what the client will get, rendered above the send button. */
  preview: ReactNode;
  /** Used to pre-select the right portal and property. */
  clientEmail?: string | null;
  clientName?: string | null;
  propertyAddress?: string | null;
  /** A previous send: the document it created is replaced instead of duplicated. */
  previousDocumentId?: string | null;
  previousSentAt?: string | null;
  onSent: (result: DeliverResult & { portalId: string }) => void | Promise<void>;
}

export function SendToPortalDialog({
  open, onClose, title, displayName, fileName, buildBlob, preview,
  clientEmail, clientName, propertyAddress, previousDocumentId, previousSentAt, onSent,
}: Props) {
  const [portals, setPortals] = useState<PortalOption[]>([]);
  const [portalId, setPortalId] = useState('');
  const [properties, setProperties] = useState<PortalPropertyOption[]>([]);
  const [propertyId, setPropertyId] = useState('general');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadPortalOptions()
      .then((list) => {
        setPortals(list);
        const match = matchPortal(list, clientEmail, clientName);
        if (match) setPortalId(match.id);
      })
      .catch((e: any) => toast.error('Could not load client portals', { description: e?.message }))
      .finally(() => setLoading(false));
  }, [open, clientEmail, clientName]);

  useEffect(() => {
    if (!portalId) { setProperties([]); setPropertyId('general'); return; }
    loadPortalProperties(portalId)
      .then((list) => {
        setProperties(list);
        const match = matchProperty(list, propertyAddress);
        setPropertyId(match ? match.id : 'general');
      })
      .catch(() => { setProperties([]); setPropertyId('general'); });
  }, [portalId, propertyAddress]);

  const selected = portals.find(p => p.id === portalId);
  const noPortals = !loading && portals.length === 0;
  const notActivated = !!selected && !selected.user_id;

  const send = async () => {
    if (!portalId) return;
    setSending(true);
    try {
      const blob = await buildBlob();
      const result = await deliverDocumentToPortal({
        portalId,
        propertyId: propertyId === 'general' ? null : propertyId,
        blob,
        fileName,
        displayName,
        replaceDocumentId: previousDocumentId,
      });
      await onSent({ ...result, portalId });
      if (!result.clientActivated) {
        toast.success('Saved to the client portal', {
          description: `${selected?.full_name || 'This client'} has not activated their portal yet, so no email went out. They will see it once they sign in.`,
        });
      } else {
        toast.success(result.replaced ? 'Replaced the earlier copy in the client portal' : 'Sent to the client portal', {
          description: 'The client has been notified by email that a new document is waiting.',
        });
      }
      onClose();
    } catch (e: any) {
      console.error('Send to portal failed', e);
      toast.error('Could not send to the portal', { description: e?.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            This is exactly what the client will see. Nothing is sent until you press Send.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading client portals…
          </div>
        ) : noPortals ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm space-y-3">
            <p className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
              <span>
                {clientName || 'This client'} does not have a client portal yet, so there is nowhere
                to send this. Create the portal first, then come back here.
              </span>
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/dashboard/client-portals" onClick={onClose}>Create a client portal</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {previousSentAt && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Already sent on {new Date(previousSentAt).toLocaleString()}. Sending again replaces
                that copy rather than adding a second one.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Client portal</Label>
                <Select value={portalId} onValueChange={setPortalId}>
                  <SelectTrigger><SelectValue placeholder="Choose a client" /></SelectTrigger>
                  <SelectContent>
                    {portals.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email || 'Unnamed client'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Attach to</Label>
                <Select value={propertyId} onValueChange={setPropertyId} disabled={!portalId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">The portal (no specific property)</SelectItem>
                    {properties.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.address || p.mls_number || 'Property'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {notActivated && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                <MailWarning className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <span>
                  {selected?.full_name || 'This client'} has not activated their portal yet. The
                  document will be saved and waiting, but no email will be sent until they do.
                </span>
              </p>
            )}

            <div className="space-y-2">
              <Label>Preview — what the client receives</Label>
              <div className="rounded-md border bg-card p-4 text-sm space-y-3">
                <p className="font-medium">{displayName}</p>
                {preview}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={!portalId || sending || noPortals}>
            {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            {previousSentAt ? 'Send again (replaces)' : 'Send to client portal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
