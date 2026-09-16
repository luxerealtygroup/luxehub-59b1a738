import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Guest, GUEST_COLUMNS } from '@/lib/openHouse/guests';
import { SendReportToPortalDialog } from './SendReportToPortalDialog';

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
  agentName?: string | null;
  onSent: () => void;
  className?: string;
}

/**
 * Card-level "Send to client portal". Pulls the guest list only when pressed,
 * so the tracker list stays light.
 */
export function OpenHouseSendToPortalButton({ openHouse, agentName, onSent, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [guests, setGuests] = useState<Guest[] | null>(null);

  const start = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('open_house_visitors')
      .select(GUEST_COLUMNS)
      .eq('open_house_id', openHouse.id)
      .order('signed_in_at', { ascending: true });
    setLoading(false);
    if (error) {
      toast.error('Could not load the guest list', { description: error.message });
      return;
    }
    setGuests((data || []) as unknown as Guest[]);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={className}
        disabled={loading}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); start(); }}
      >
        {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Share2 className="h-4 w-4 mr-1" />}
        {openHouse.portal_sent_at ? 'Send again' : 'Send to portal'}
      </Button>

      {guests && (
        <SendReportToPortalDialog
          openHouse={openHouse}
          guests={guests}
          agentName={agentName}
          onClose={() => setGuests(null)}
          onSent={() => { setGuests(null); onSent(); }}
        />
      )}
    </>
  );
}
