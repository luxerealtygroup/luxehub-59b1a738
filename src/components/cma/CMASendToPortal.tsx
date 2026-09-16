import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { SendToPortalDialog } from '@/components/portal/SendToPortalDialog';
import { CmaPdfInput, buildCmaClientPdf, formatCmaDate } from '@/lib/cma/clientPdf';
import { safeFileName } from '@/lib/portalDelivery';

interface Props {
  reportId: string;
  clientName?: string | null;
  pdfInput: CmaPdfInput;
  previousDocumentId?: string | null;
  previousSentAt?: string | null;
  onSent: () => void;
}

/** "Send to client portal" for a finished CMA. The agent always presses it. */
export function CMASendToPortal({
  reportId, clientName, pdfInput, previousDocumentId, previousSentAt, onSent,
}: Props) {
  const [open, setOpen] = useState(false);
  // Our own record of what went to the client and when, so nobody has to remember.
  const [sends, setSends] = useState<Array<{ id: string; version_number: number; created_at: string }>>([]);

  const loadSends = async () => {
    const { data } = await supabase
      .from('cma_portal_sends' as any)
      .select('id, version_number, created_at')
      .eq('report_id', reportId)
      .order('version_number', { ascending: true });
    setSends((data as any) || []);
  };
  useEffect(() => { loadSends(); }, [reportId]);

  const dateLabel = formatCmaDate(pdfInput.createdAt);
  const displayName = `Comparative market analysis — ${pdfInput.propertyAddress} — ${dateLabel}`;
  const fileName = safeFileName(`cma-${pdfInput.propertyAddress}-${dateLabel}`);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Share2 className="h-4 w-4 mr-2" />
        {previousSentAt ? 'Send to portal again' : 'Send to Client Portal'}
      </Button>

      {sends.length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
          <p className="font-medium text-foreground">Sent to the client portal</p>
          {sends.map((s) => (
            <p key={s.id}>
              Version {s.version_number} · {new Date(s.created_at).toLocaleString()}
            </p>
          ))}
        </div>
      )}

      {open && (
        <SendToPortalDialog
          open
          onClose={() => setOpen(false)}
          title="Send this CMA to the client portal"
          displayName={displayName}
          fileName={fileName}
          clientName={clientName}
          propertyAddress={pdfInput.propertyAddress}
          previousDocumentId={previousDocumentId}
          previousSentAt={previousSentAt}
          versionMode="version"
          docKind="cma"
          buildBlob={() => buildCmaClientPdf(pdfInput).output('blob') as Blob}
          onSent={async (result) => {
            const { data: { user } } = await supabase.auth.getUser();
            await supabase
              .from('cma_reports')
              .update({
                portal_account_id: result.portalId,
                portal_document_id: result.documentId,
                portal_sent_at: new Date().toISOString(),
              } as any)
              .eq('id', reportId);
            // Keep the full "what did we send them and when" record on our side.
            await supabase.from('cma_portal_sends').insert({
              report_id: reportId,
              portal_id: result.portalId,
              document_id: result.documentId,
              property_id: result.propertyId,
              version_group_id: result.versionGroupId,
              version_number: result.versionNumber,
              property_address: pdfInput.propertyAddress,
              sent_by: user?.id ?? null,
            } as any);
            setOpen(false);
            await loadSends();
            onSent();
          }}

          preview={(
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                The finished CMA document for <span className="font-medium text-foreground">{pdfInput.propertyAddress}</span>,
                dated {dateLabel}: summary, recommended pricing, market conditions, strategy and the
                comparable sales behind it.
              </p>
              {pdfInput.executiveSummary && (
                <p className="italic line-clamp-6">“{pdfInput.executiveSummary}”</p>
              )}
            </div>
          )}
        />
      )}
    </>
  );
}
