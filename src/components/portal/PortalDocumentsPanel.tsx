import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { blockPortalWrite, usePortalPreview } from '@/hooks/usePortalPreview';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Eye, EyeOff, FileText, File, Image as ImageIcon, Loader2, Lock, Trash2, Upload, X } from 'lucide-react';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PortalScope, matchesScope, scopePropertyId } from '@/lib/portalScope';
import { PortalProperty, propertyLabel } from '@/hooks/usePortalProperties';

interface PortalDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  property_id: string | null;
  is_internal: boolean;
  created_at: string;
}


interface Props {
  portalId: string;
  canManage: boolean;
  /** Property scope: 'all', 'general' (portal-wide only) or a property id. */
  scope?: PortalScope;
  /** Properties on this portal, so an uploader can pick where a file belongs. */
  properties?: PortalProperty[];
}

const BUCKET = 'portal-documents';

function iconFor(type: string | null, name: string) {
  const t = (type || '').toLowerCase();
  const n = name.toLowerCase();
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/.test(n)) {
    return { icon: <ImageIcon className="h-5 w-5" />, tone: 'bg-sky-500/10 text-sky-600 ring-sky-500/20' };
  }
  if (t === 'application/pdf' || n.endsWith('.pdf')) {
    return { icon: <FileText className="h-5 w-5" />, tone: 'bg-rose-500/10 text-rose-600 ring-rose-500/20' };
  }
  return { icon: <File className="h-5 w-5" />, tone: 'bg-primary/10 text-primary ring-primary/20' };
}

function fmtSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PortalDocumentsPanel({ portalId, canManage: canManageProp, scope = 'all', properties = [] }: Props) {
  const { isPreview } = usePortalPreview();
  const canManage = canManageProp && !isPreview;
  const { toast } = useToast();
  const [docs, setDocs] = useState<PortalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Where new uploads land: defaults to the property currently being viewed.
  const [uploadTarget, setUploadTarget] = useState<string>(scopePropertyId(scope) ?? 'general');
  const [uploadInternal, setUploadInternal] = useState(false);
  useEffect(() => { setUploadTarget(scopePropertyId(scope) ?? 'general'); }, [scope]);
  // Internal (agent-only) rows are blocked by RLS for real clients; preview mode
  // runs on the agent's session, so filter them out here to stay accurate.
  const showInternal = canManageProp && !isPreview;


  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('portal_documents')
      .select('*')
      .eq('portal_id', portalId)
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Failed to load documents', description: error.message, variant: 'destructive' });
    setDocs((data as PortalDocument[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [portalId]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (blockPortalWrite('Uploading documents')) return;
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    for (const file of files) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${portalId}/${crypto.randomUUID()}_${safe}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (up.error) {
        toast({ title: `Upload failed: ${file.name}`, description: up.error.message, variant: 'destructive' });
        continue;
      }
      const { data: inserted, error } = await supabase.from('portal_documents').insert({
        portal_id: portalId,
        file_name: file.name,
        file_path: path,
        file_type: file.type || null,
        file_size: file.size,
        uploaded_by: user?.id,
        property_id: uploadTarget === 'general' ? null : uploadTarget,
      }).select('id').single();
      if (error) toast({ title: 'Record failed', description: error.message, variant: 'destructive' });

      // Fire-and-forget copy into Follow Up Boss. Never blocks or fails the upload;
      // skips silently server-side when the portal has no FUB contact linked.
      if (inserted?.id) {
        void supabase.functions
          .invoke('fub-push-attachment', { body: { document_id: inserted.id } })
          .catch(() => {});
      }
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    load();
  };

  const signedUrl = async (path: string) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  };

  const openPreview = async (d: PortalDocument) => {
    const url = await signedUrl(d.file_path);
    if (!url) return;
    const isImg = (d.file_type || '').startsWith('image/');
    const isPdf = d.file_type === 'application/pdf' || d.file_name.toLowerCase().endsWith('.pdf');
    if (isImg || isPdf) setPreview({ url, type: isImg ? 'image' : 'pdf', name: d.file_name });
    else window.open(url, '_blank');
  };

  const download = async (d: PortalDocument) => {
    const url = await signedUrl(d.file_path);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = d.file_name; a.target = '_blank';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const del = async (d: PortalDocument) => {
    if (blockPortalWrite('Deleting documents')) return;
    if (!confirm(`Delete "${d.file_name}"?`)) return;
    await supabase.storage.from(BUCKET).remove([d.file_path]);
    const { error } = await supabase.from('portal_documents').delete().eq('id', d.id);
    if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    load();
  };

  const visibleDocs = docs.filter((d) => matchesScope(d.property_id, scope));

  return (
    <div className="space-y-4">
      {canManage && properties.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Upload to</span>
          <Select value={uploadTarget} onValueChange={setUploadTarget}>
            <SelectTrigger className="h-9 max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General (whole portal)</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{propertyLabel(p)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {canManage && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center h-28 border-2 border-dashed border-primary/30 rounded-2xl bg-primary/[0.03] hover:bg-primary/[0.06] hover:border-primary/50 transition-all group"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 group-hover:scale-105 transition-transform">
              <Upload className="h-5 w-5" />
            </div>
          )}
          <span className="mt-2 text-sm font-medium text-foreground">Upload documents</span>
          <span className="text-xs text-muted-foreground">Drop files or click to browse</span>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={onUpload} />
        </button>
      )}

      {loading ? (
        <div className="grid gap-2">
          {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-muted/60 animate-pulse" />)}
        </div>
      ) : visibleDocs.length === 0 ? (
        <div className="luxe-card p-12 flex flex-col items-center justify-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 mb-4">
            <FileText className="h-6 w-6" />
          </div>
          <h3 className="font-display text-lg font-semibold tracking-tight mb-1">
            No documents yet
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {canManage ? 'Upload the first file above to share it with your client.' : 'Your agent will add your documents here soon.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleDocs.map((d) => {
            const { icon, tone } = iconFor(d.file_type, d.file_name);
            return (
              <div
                key={d.id}
                className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm hover:shadow-luxe-hover hover:border-primary/30 hover:-translate-y-0.5 transition-all"
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${tone}`}>
                  {icon}
                </div>
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => openPreview(d)}
                    className="text-sm font-medium text-foreground text-left truncate hover:text-primary transition-colors block w-full"
                    title={d.file_name}
                  >
                    {d.file_name}
                  </button>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(d.created_at), 'MMM d, yyyy')}
                    {d.file_size ? ` · ${fmtSize(d.file_size)}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => openPreview(d)} title="Preview">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full hover:bg-primary/10 hover:text-primary" onClick={() => download(d)} title="Download">
                    <Download className="h-4 w-4" />
                  </Button>
                  {canManage && (
                    <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full hover:bg-destructive/10" onClick={() => del(d)} title="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 border-0 bg-background/98 backdrop-blur-xl gap-0 flex flex-col">
          <DialogHeader className="px-6 py-4 border-b border-border/60 flex flex-row items-center justify-between space-y-0">
            <DialogTitle className="truncate font-display text-lg font-semibold tracking-tight">
              {preview?.name}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {preview && (
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => window.open(preview.url, '_blank')}>
                  <Download className="h-4 w-4 mr-2" /> Download
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-muted/30 p-4">
            {preview?.type === 'image' ? (
              <img src={preview.url} alt={preview.name} className="max-w-full max-h-full object-contain rounded-lg shadow-luxe" />
            ) : preview?.type === 'pdf' ? (
              <iframe src={preview.url} title={preview.name} className="w-full h-full min-h-[80vh] rounded-lg shadow-luxe bg-white" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}