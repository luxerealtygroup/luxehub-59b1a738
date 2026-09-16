import { useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { SendToPortalDialog } from '@/components/portal/SendToPortalDialog';
import { Guest } from '@/lib/openHouse/guests';
import {
  buildClientOpenHouseReportPdf, clientFeedbackRows, formatDuration, formatReportDate,
} from '@/lib/openHouse/clientReport';
import { safeFileName } from '@/lib/portalDelivery';

interface Props {
  openHouse: {
    id: string;
    property_address: string;
    open_house_date: string;
    starts_at: string | null;
    ends_at: string | null;
    client_name: string | null;
    client_email: string | null;
    seller_notes: string | null;
    portal_document_id?: string | null;
    portal_sent_at?: string | null;
  };
  guests: Guest[];
  agentName?: string | null;
  onClose: () => void;
  onSent: () => void;
}

/**
 * The seller's copy of the open house recap. The agent sees the exact contents
 * first and can rewrite or clear their own notes before it goes.
 */
export function SendReportToPortalDialog({ openHouse, guests, agentName, onClose, onSent }: Props) {
  const [notes, setNotes] = useState(openHouse.seller_notes || '');
  const rows = useMemo(() => clientFeedbackRows(guests), [guests]);

  const dateLabel = formatReportDate(openHouse.open_house_date);
  const displayName = `Open house report — ${openHouse.property_address} — ${dateLabel}`;
  const fileName = safeFileName(`open-house-report-${openHouse.property_address}-${openHouse.open_house_date}`);

  return (
    <SendToPortalDialog
      open
      onClose={onClose}
      title="Send the open house report to the client portal"
      displayName={displayName}
      fileName={fileName}
      clientEmail={openHouse.client_email}
      clientName={openHouse.client_name}
      propertyAddress={openHouse.property_address}
      previousDocumentId={openHouse.portal_document_id}
      previousSentAt={openHouse.portal_sent_at}
      versionMode="replace"
      docKind="open_house"


      buildBlob={() => buildClientOpenHouseReportPdf({
        propertyAddress: openHouse.property_address,
        openHouseDate: openHouse.open_house_date,
        startsAt: openHouse.starts_at,
        endsAt: openHouse.ends_at,
        guests,
        agentNotes: notes,
        agentName,
      }).output('blob') as Blob}
      onSent={async (result) => {
        await supabase
          .from('open_houses')
          .update({
            seller_notes: notes.trim() || null,
            portal_account_id: result.portalId,
            portal_document_id: result.documentId,
            portal_sent_at: new Date().toISOString(),
          } as any)
          .eq('id', openHouse.id);
        onSent();
      }}
      preview={(
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Date</p>
              <p className="font-medium">{dateLabel}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Hours</p>
              <p className="font-medium">{formatDuration(openHouse.starts_at, openHouse.ends_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Visitors</p>
              <p className="font-medium">{guests.length}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium">Visitor feedback</p>
              <Badge variant="outline" className="text-[10px]">Names and contact details removed</Badge>
            </div>
            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No visitor feedback was recorded.</p>
            ) : (
              <ul className="space-y-1.5">
                {rows.map((r) => (
                  <li key={r.label} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{r.label}</span>
                    {` · Interest: ${r.interest} · Price: ${r.price} · Condition: ${r.condition} · Timeline: ${r.timeline}`}
                    {r.notes !== '—' && <div className="italic">“{r.notes}”</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Your notes for the client (edit or clear)</Label>
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything you want the seller to know about the day…"
            />
            <p className="text-[11px] text-muted-foreground">
              Leave this empty and the report goes without a notes section.
            </p>
          </div>
        </div>
      )}
    />
  );
}
