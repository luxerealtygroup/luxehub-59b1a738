/**
 * Containment for the super-admin "View as team" preview.
 *
 * A preview may only ever be rendered on its own dedicated route. If the app
 * navigates anywhere else while a preview is active, the session is ended
 * immediately, which also drops the previewed team's branding override.
 *
 * Why this exists: every ordinary page (Pipeline, Transactions, Weekly
 * accountability, the client portal) reads through the signed-in user's own
 * session, which resolves to their own organization. Leaving the branding
 * override in place off-route made those pages render LUXE's records inside a
 * tenant's logo and colours. Previewed data comes exclusively from the
 * org-preview function's allowlisted datasets on the preview route.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { isOrgPreviewPath, useOrgPreview } from '@/hooks/useOrgPreview';

export function OrgPreviewRouteGuard() {
  const { pathname } = useLocation();
  const { isPreviewing, branding, stop } = useOrgPreview();

  useEffect(() => {
    if (!isPreviewing) return;
    if (isOrgPreviewPath(pathname)) return;
    const name = branding?.name;
    void stop();
    toast.info('Preview ended', {
      description: name
        ? `You left ${name}'s preview, so you are back in your own hub.`
        : 'You left the team preview, so you are back in your own hub.',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, isPreviewing]);

  return null;
}

export default OrgPreviewRouteGuard;
