import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SendToPortalDialog } from '@/components/portal/SendToPortalDialog';
import { CmaPdfInput, buildCmaClientPdf, formatCmaDate } from '@/lib/cma/clientPdf';
import { loadCmaPdfInput } from '@/lib/cma/loadPdfInput';
import { anomalyMessage, detectDuplicateSoldPriceAnomaly } from '@/lib/cma/reportQuality';
import { safeFileName } from '@/lib/portalDelivery';

interface Props {
  reportId: string;
  clientName?: string | null;
  /** Supply the finished document when the caller already has it; otherwise it is loaded on demand. */
  pdfInput?: CmaPdfInput;
  previousDocumentId?: string | null;
  previousSentAt?: string | null;
  /** When given, sending is blocked until the CMA has been approved. */
  approvalStatus?: string | null;
  onSent: () => void;
  size?: 'sm' | 'default';
  className?: string;
  /** Card version: no history list, shorter label. */
  compact?: boolean;
}

const APPROVED_STATUSES = ['approved', 'exported', 'pushed', 'converted'];
const NOT_APPROVED_REASON = 'Approve this CMA before sending it to the client portal.';
const UNCONFIRMED_ANOMALY_REASON = 'Confirm the repeated comparable sold prices before sending this CMA.';

/** "Send to client portal" for a finished CMA. The agent always presses it. */
export function CMASendToPortal({
  reportId, clientName, pdfInput, previousDocumentId, previousSentAt,
  approvalStatus, onSent, size = 'default', className, compact,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState<{
    input: CmaPdfInput; clientName: string | null;
    previousDocumentId: string | null; previousSentAt: string | null;
  } | null>(null);
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
  useEffect(() => { if (!compact) loadSends(); }, [reportId, compact]);

  const approved = approvalStatus == null ? true : APPROVED_STATUSES.includes(approvalStatus);

  const handleClick = async () => {
    if (pdfInput) {
      const anomaly = detectDuplicateSoldPriceAnomaly(pdfInput.comps || []);
      if (anomaly.hasAnomaly && !pdfInput.compPriceAnomalyConfirmedAt) {
        toast.error(UNCONFIRMED_ANOMALY_REASON, { description: anomalyMessage(anomaly) });
        return;
      }
      setOpen(true);
      return;
    }
    setLoading(true);
    try {
      const result = await loadCmaPdfInput(reportId);
      const anomaly = detectDuplicateSoldPriceAnomaly(result.input.comps || []);
      if (anomaly.hasAnomaly && !result.input.compPriceAnomalyConfirmedAt) {
        toast.error(UNCONFIRMED_ANOMALY_REASON, { description: anomalyMessage(anomaly) });
        return;
      }
      setLoaded(result);
      setOpen(true);
    } catch (err: any) {
      console.error('Failed to prepare the CMA document', err);
      toast.error('Could not prepare the CMA document', { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  const input = pdfInput ?? loaded?.input ?? null;
  const priorDocumentId = previousDocumentId ?? loaded?.previousDocumentId ?? null;
  const priorSentAt = previousSentAt ?? loaded?.previousSentAt ?? null;
  const client = clientName ?? loaded?.clientName ?? null;

  const label = approved
    ? (priorSentAt ? (compact ? 'Send again' : 'Send to portal again') : (compact ? 'Send to portal' : 'Send to Client Portal'))
    : (compact ? 'Send to portal' : 'Send to Client Portal');

  return (
    <>
      <Button
        variant="outline"
        size={size}
        className={className}
        disabled={!approved || loading}
        title={approved ? undefined : NOT_APPROVED_REASON}
        onClick={(e) => { e.stopPropagation(); handleClick(); }}
      >
        {loading
          ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          : <Share2 className="h-4 w-4 mr-2" />}
        {label}
      </Button>

      {!approved && !compact && (
        <p className="text-xs text-muted-foreground">{NOT_APPROVED_REASON}</p>
      )}

      {!compact && sends.length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
          <p className="font-medium text-foreground">Sent to the client portal</p>
          {sends.map((s) => (
            <p key={s.id}>
              Version {s.version_number} · {new Date(s.created_at).toLocaleString()}
            </p>
          ))}
        </div>
      )}

      {open && input && (
        <SendToPortalDialog
          open
          onClose={() => setOpen(false)}
          title="Send this CMA to the client portal"
          displayName={`Comparative market analysis — ${input.propertyAddress} — ${formatCmaDate(input.createdAt)}`}
          fileName={safeFileName(`cma-${input.propertyAddress}-${formatCmaDate(input.createdAt)}`)}
          clientName={client}
          propertyAddress={input.propertyAddress}
          previousDocumentId={priorDocumentId}
          previousSentAt={priorSentAt}
          versionMode="version"
          docKind="cma"
          buildBlob={() => buildCmaClientPdf(input).output('blob') as Blob}
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
              property_address: input.propertyAddress,
              sent_by: user?.id ?? null,
            } as any);
            setOpen(false);
            await loadSends();
            onSent();
          }}

          preview={(
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                The finished CMA document for <span className="font-medium text-foreground">{input.propertyAddress}</span>,
                dated {formatCmaDate(input.createdAt)}: summary, recommended pricing, market conditions, strategy and the
                comparable sales behind it.
              </p>
              {input.executiveSummary && (
                <p className="italic line-clamp-6">“{input.executiveSummary}”</p>
              )}
            </div>
          )}
        />
      )}
    </>
  );
}
