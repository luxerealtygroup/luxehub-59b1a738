import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';

type Category = 'property' | 'milestone';

interface PortalPhoto {
  id: string;
  file_path: string;
  caption: string | null;
  category: Category;
  created_at: string;
}

interface Props {
  portalId: string;
  canManage: boolean;
}

const BUCKET = 'portal-photos';

function PhotoThumb({ path, onOpen }: { path: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data }) => {
      if (mounted && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { mounted = false; };
  }, [path]);
  if (!url) return <div className="aspect-square rounded-lg bg-muted animate-pulse" />;
  return (
    <button onClick={() => onOpen(url)} className="aspect-square overflow-hidden rounded-lg bg-muted group relative">
      <img src={url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
    </button>
  );
}

export function PortalPhotosPanel({ portalId, canManage }: Props) {
  const { toast } = useToast();
  const [photos, setPhotos] = useState<PortalPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<Category>('property');
  const [caption, setCaption] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('portal_photos')
      .select('*')
      .eq('portal_id', portalId)
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Failed to load photos', description: error.message, variant: 'destructive' });
    setPhotos((data as PortalPhoto[]) || []);
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
      const path = `${portalId}/${category}/${crypto.randomUUID()}_${safe}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (up.error) {
        toast({ title: `Upload failed: ${file.name}`, description: up.error.message, variant: 'destructive' });
        continue;
      }
      const { error } = await supabase.from('portal_photos').insert({
        portal_id: portalId,
        file_path: path,
        caption: caption.trim() || null,
        category,
        uploaded_by: user?.id,
      });
      if (error) toast({ title: 'Record failed', description: error.message, variant: 'destructive' });
    }
    setUploading(false);
    setCaption('');
    if (inputRef.current) inputRef.current.value = '';
    load();
  };

  const downloadPhoto = async (p: PortalPhoto) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(p.file_path, 3600);
    if (!data?.signedUrl) return;
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = p.file_path.split('/').pop() || 'photo';
    a.target = '_blank';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const del = async (p: PortalPhoto) => {
    if (!confirm('Delete this photo?')) return;
    await supabase.storage.from(BUCKET).remove([p.file_path]);
    const { error } = await supabase.from('portal_photos').delete().eq('id', p.id);
    if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    load();
  };

  const property = photos.filter((p) => p.category === 'property');
  const milestone = photos.filter((p) => p.category === 'milestone');

  const Section = ({ title, list }: { title: string; list: PortalPhoto[] }) => (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {list.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4">No {title.toLowerCase()} yet.</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {list.map((p) => (
            <div key={p.id} className="space-y-1">
              <PhotoThumb path={p.file_path} onOpen={setLightbox} />
              {p.caption && <div className="text-xs text-muted-foreground truncate">{p.caption}</div>}
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-6 px-1 flex-1" onClick={() => downloadPhoto(p)}>
                  <Download className="h-3 w-3" />
                </Button>
                {canManage && (
                  <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => del(p)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
          <div className="flex gap-2">
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="property">Property</SelectItem>
                <SelectItem value="milestone">Milestone</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <div
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
            <span className="mt-1 text-xs text-muted-foreground">Click to upload {category} photos</span>
            <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={onUpload} />
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
      ) : photos.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
          <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
          {canManage ? 'No photos yet. Upload the first photo above.' : 'Your agent will add photos here soon.'}
        </div>
      ) : (
        <div className="space-y-4">
          <Section title="Property Photos" list={property} />
          <Section title="Milestone Photos" list={milestone} />
        </div>
      )}

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Photo</DialogTitle></DialogHeader>
          {lightbox && <img src={lightbox} alt="" className="w-full h-auto max-h-[75vh] object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}