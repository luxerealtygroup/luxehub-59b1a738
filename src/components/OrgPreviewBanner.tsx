/**
 * Persistent read-only banner shown while a super-admin previews another team's
 * hub. Always visible, always offers an exit.
 */
import { useNavigate } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrgPreview } from '@/hooks/useOrgPreview';

export function OrgPreviewBanner() {
  const { isPreviewing, branding, stop } = useOrgPreview();
  const navigate = useNavigate();

  if (!isPreviewing || !branding) return null;

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-100 px-4 py-2 text-amber-950">
      <div className="flex items-center gap-2 text-sm">
        <Eye className="h-4 w-4 shrink-0" />
        <span>
          Previewing <strong>{branding.name}</strong> — read-only. Nothing you do here can change
          this team's data.
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-amber-400 bg-white/80 hover:bg-white"
        onClick={async () => {
          await stop();
          navigate('/dashboard/admin/tenants');
        }}
      >
        <X className="mr-1 h-3.5 w-3.5" />
        Exit preview
      </Button>
    </div>
  );
}

export default OrgPreviewBanner;
