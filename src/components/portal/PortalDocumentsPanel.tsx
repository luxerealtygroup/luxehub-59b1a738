import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Eye, FileText, File, Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { format } from 'date-fns';

interface PortalDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

interface Props {
  portalId: string;
  canManage: boolean;
}

const BUCKET = 'portal-documents';

function iconFor(type: string | null, name: string) {
  const t = (type || '').toLowerCase();
  const n = name.toLowerCase();
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/.test(n)) return <ImageIcon className="h-4 w-4 text-blue-500" />;
  if (t === 'application/pdf' || n.endsWith('.pdf')) return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function fmtSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PortalDocumentsPanel({ portalId, canManage }: Props) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<PortalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const { error } = await supabase.from('portal_documents').insert({
        portal_id: portalId,
        file_name: file.name,
        file_path: path,
        file_type: file.type || null,
        file_size: file.size,
        uploaded_by: user?.id,
      });
      if (error) toast({ title: 'Record failed', description: error.message, variant: 'destructive' });
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
    if (!confirm(`Delete "${d.file_name}"?`)) return;
    await supabase.storage.from(BUCKET).remove([d.file_path]);
    const { error } = await supabase.from('portal_documents').delete().eq('id', d.id);
    if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    load();
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <div
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
        >
          {uploading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
          <span className="mt-1 text-sm text-muted-foreground">Click to upload documents</span>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={onUpload} />
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          {canManage ? 'No documents yet. Upload the first file above.' : 'Your agent will add your documents here soon.'}
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 hover:bg-muted/30">
              <div className="flex items-center gap-2 min-w-0">
                {iconFor(d.file_type, d.file_name)}
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{d.file_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(d.created_at), 'MMM d, yyyy')}{d.file_size ? ` • ${fmtSize(d.file_size)}` : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => openPreview(d)}><Eye className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => download(d)}><Download className="h-4 w-4" /></Button>
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => del(d)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle className="truncate">{preview?.name}</DialogTitle></DialogHeader>
          {preview?.type === 'image' ? (
            <img src={preview.url} alt={preview.name} className="w-full h-auto max-h-[75vh] object-contain" />
          ) : preview?.type === 'pdf' ? (
            <iframe src={preview.url} title={preview.name} className="w-full h-[75vh]" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}