import { usePortalDealSuggestions } from '@/hooks/usePortalDealSuggestions';
import { PortalDealSuggestions } from '@/components/portal/PortalDealSuggestions';

interface Props {
  portalId: string;
  clientName: string | null;
  fubPersonId: number | null;
  onSaved?: () => void;
}

/**
 * One portal's on-demand FUB stage check, rendered on the Client Portals page.
 * Renders nothing unless a linked deal has moved since the agent last saw it.
 */
export function PortalSuggestionScanner({ portalId, clientName, fubPersonId, onSaved }: Props) {
  const { suggestions, dismiss } = usePortalDealSuggestions(portalId, fubPersonId);
  if (suggestions.length === 0) return null;
  return (
    <PortalDealSuggestions
      portalId={portalId}
      clientName={clientName}
      suggestions={suggestions}
      onDismiss={dismiss}
      onSaved={onSaved}
    />
  );
}
