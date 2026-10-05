import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Review-then-send for the open house report to the listing agent.
 * The preview is rendered on the server from the same template that is sent,
 * so what the agent sees is what the listing agent receives. Nothing is sent
 * until Confirm & Send.
 */
export function SendListingReportDialog({
  openHouseId,
  defaultRecipient,
  templateData,
  onClose,
  onSent,
}: {
  openHouseId: string;
  defaultRecipient: string;
  templateData: Record<string, unknown>;
  onClose: () => void;
  onSent: () => void;
}) {
  const { user } = useAuth();
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ to: string; at: Date } | null>(null);

  const data = { ...templateData, personalNote: note.trim() };

  // Re-render the preview shortly after the note stops changing.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data: res, error } = await supabase.functions.invoke('render-report-preview', {
        body: { templateData: data },
      });
      if (cancelled) return;
      setLoading(false);
      if (error || !res?.html) {
        toast.error('Could not load the preview');
        setPreview(null);
      } else {
        setPreview(res);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  const to = recipient.trim();
  const validTo = EMAIL_RE.test(to);

  const confirmSend = async () => {
    if (!validTo || sending) return;
    setSending(true);
    const { error } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'open-house-feedback',
        recipientEmail: to,
        idempotencyKey: `oh-report-${openHouseId}-${crypto.randomUUID()}`,
        templateData: data,
      },
    });
    if (error) {
      setSending(false);
      toast.error('Email failed', { description: error.message });
      return;
    }
    const at = new Date();
    const { error: logErr } = await supabase
      .from('open_houses')
      .update({
        listing_report_sent_at: at.toISOString(),
        listing_report_sent_to: to,
        listing_report_sent_by: user?.id ?? null,
      } as never)
      .eq('id', openHouseId);
    if (logErr) toast.error('Sent, but could not record it on the open house', { description: logErr.message });
    setSending(false);
    setSent({ to, at });
    onSent();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sent ? 'Report sent' : 'Review the report before sending'}</DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
            <div className="text-sm">
              <p className="font-medium">Sent to {sent.to}</p>
              <p className="text-muted-foreground">{sent.at.toLocaleString()}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="report-to">To</Label>
              <Input id="report-to" type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
              {!validTo && <p className="text-xs text-destructive">Enter a valid email address.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-note">Personal note (optional, shown at the top)</Label>
              <Textarea
                id="report-note"
                rows={3}
                maxLength={600}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Thanks for the opportunity to host — here's how it went."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{preview?.subject || '…'}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <div className="relative overflow-hidden rounded-md border">
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}
                {preview ? (
                  <iframe
                    title="Email preview"
                    sandbox=""
                    srcDoc={preview.html}
                    className="h-[480px] w-full bg-card"
                  />
                ) : (
                  <div className="h-[200px]" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                A standard unsubscribe line is added at the very bottom when it is sent.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {sent ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={sending}>Back</Button>
              <Button onClick={confirmSend} disabled={!validTo || !preview || loading || sending}>
                {sending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Confirm &amp; Send
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
