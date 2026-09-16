import { useState } from 'react';
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

  const dateLabel = formatCmaDate(pdfInput.createdAt);
  const displayName = `Comparative market analysis — ${pdfInput.propertyAddress} — ${dateLabel}`;
  const fileName = safeFileName(`cma-${pdfInput.propertyAddress}-${dateLabel}`);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Share2 className="h-4 w-4 mr-2" />
        {previousSentAt ? 'Send to portal again' : 'Send to Client Portal'}
      </Button>

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
          buildBlob={() => buildCmaClientPdf(pdfInput).output('blob') as Blob}
          onSent={async (result) => {
            await supabase
              .from('cma_reports')
              .update({
                portal_account_id: result.portalId,
                portal_document_id: result.documentId,
                portal_sent_at: new Date().toISOString(),
              } as any)
              .eq('id', reportId);
            setOpen(false);
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
