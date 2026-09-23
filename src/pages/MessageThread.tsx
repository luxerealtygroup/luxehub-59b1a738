import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Home, Paperclip, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { PortalChatPanel } from '@/components/portal/PortalChatPanel';
import { AgentPortalDialog } from '@/components/AgentPortalDialog';
import { UploadPickers } from '@/components/uploads/UploadPickers';
import { checkFiles } from '@/lib/uploads';

const BUCKET = 'portal-documents';

interface PortalInfo {
  id: string;
  full_name: string | null;
  email: string;
  client_type: string | null;
  fub_person_id: number | null;
  invited_by: string | null;
  assigned_agent_id: string | null;
}

export default function MessageThread() {
  const { portalId } = useParams<{ portalId: string }>();
  const { toast } = useToast();
  const [portal, setPortal] = useState<PortalInfo | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!portalId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: acc }, { data: props }] = await Promise.all([
        supabase
          .from('client_accounts')
          .select('id, full_name, email, client_type, fub_person_id, invited_by, assigned_agent_id')
          .eq('id', portalId)
          .maybeSingle(),
        supabase.from('portal_properties').select('address').eq('portal_id', portalId).limit(1),
      ]);
      if (cancelled) return;
      setPortal((acc as PortalInfo) ?? null);
      setAddress(((props ?? [])[0] as any)?.address ?? null);
      setLoading(false);

      // Opening the conversation clears its unread alerts for this user.
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', auth.user.id)
          .eq('portal_id', portalId)
          .eq('type', 'message')
          .eq('is_read', false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portalId]);

  const attach = async (picked: File[]) => {
    if (!portalId) return;
    const { accepted, errors } = checkFiles(picked, { maxSizeMB: 25 });
    errors.forEach((message) =>
      toast({ title: 'File not sent', description: message, variant: 'destructive' }),
    );
    if (!accepted.length) return;
    setUploading(true);
    const { data: auth } = await supabase.auth.getUser();
    for (const file of accepted) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${portalId}/${crypto.randomUUID()}_${safe}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (up.error) {
        toast({ title: `Upload failed: ${file.name}`, description: up.error.message, variant: 'destructive' });
        continue;
      }
      const { error } = await supabase.from('portal_documents').insert({
        portal_id: portalId,
        file_name: file.name,
        file_path: path,
        file_type: file.type || null,
        file_size: file.size,
        uploaded_by: auth.user?.id,
        is_internal: false,
        source: 'transaction',
      });
      if (error) {
        toast({ title: 'Could not save the file', description: error.message, variant: 'destructive' });
        continue;
      }
      await supabase.functions.invoke('portal-send-message', {
        body: { portal_id: portalId, message: `📎 Shared a file: ${file.name}` },
      });
    }
    setUploading(false);
    toast({ title: 'Sent', description: 'Your client can open it in their Documents tab.' });
  };

  if (loading) {
    return <div className="p-10 text-center text-sm text-muted-foreground animate-pulse">Loading…</div>;
  }
  if (!portal) {
    return (
      <div className="p-10 text-center space-y-3">
        <p className="text-sm text-muted-foreground">This conversation isn't available to you.</p>
        <Button asChild variant="outline">
          <Link to="/dashboard/messages">Back to Messages</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="gap-1 px-2">
          <Link to="/dashboard/messages">
            <ArrowLeft className="h-4 w-4" />
            Messages
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl text-foreground truncate">
            {portal.full_name || portal.email}
          </h1>
          {address && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
              <Home className="h-3.5 w-3.5 shrink-0" />
              {address}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AgentPortalDialog
            clientName={portal.full_name || undefined}
            clientEmail={portal.email}
            fubPersonId={portal.fub_person_id}
            defaultType={(portal.client_type as 'buyer' | 'seller') || undefined}
            trigger={
              <Button variant="outline" size="sm" className="gap-1">
                <ExternalLink className="h-4 w-4" />
                Client record
              </Button>
            }
          />
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link to={`/client-portal/preview/${portal.id}`}>
              <ExternalLink className="h-4 w-4" />
              Their portal
            </Link>
          </Button>
        </div>
      </div>

      <PortalChatPanel
        portalId={portal.id}
        viewerRole="agent"
        sendAsAgentId={portal.assigned_agent_id ?? portal.invited_by ?? null}
      />

      <div className="flex flex-wrap items-center gap-2">
        {uploading ? (
          <span className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending file…
          </span>
        ) : (
          <>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Paperclip className="h-3.5 w-3.5" /> Send a file or photo
            </span>
            <UploadPickers onFiles={(f) => void attach(f)} disabled={uploading} size="sm" />
          </>
        )}
      </div>
    </div>
  );
}
