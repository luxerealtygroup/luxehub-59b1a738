import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, CheckSquare, Download, ImageIcon, Loader2, Trash2, Upload, Home, Trophy, X } from 'lucide-react';

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

function PhotoThumb({ path, caption, onOpen, selecting, selected, onToggle }: { path: string; caption?: string | null; onOpen: (url: string) => void; selecting?: boolean; selected?: boolean; onToggle?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data }) => {
      if (mounted && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { mounted = false; };
  }, [path]);
  if (!url) return <div className="aspect-[4/3] rounded-xl bg-muted animate-pulse" />;
  return (
    <button
      onClick={() => (selecting ? onToggle?.() : onOpen(url))}
      className={`aspect-[4/3] overflow-hidden rounded-xl bg-muted group relative shadow-sm hover:shadow-luxe-hover transition-all ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
    >
      <img src={url} alt={caption ?? ''} className={`w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500 ${selected ? 'opacity-70' : ''}`} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      {caption && (
        <div className="absolute inset-x-0 bottom-0 p-3 text-left translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
          <p className="text-white text-xs font-medium drop-shadow-md line-clamp-2">{caption}</p>
        </div>
      )}
      {selecting && (
        <div className={`absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-md transition-colors ${selected ? 'bg-primary border-primary text-primary-foreground' : 'bg-background/90 border-border'}`}>
          {selected && <Check className="h-3.5 w-3.5" />}
        </div>
      )}
    </button>
  );
}

export function PortalPhotosPanel({ portalId, canManage }: Props) {
  const { toast } = useToast();
  const [photos, setPhotos] = useState<PortalPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [category, setCategory] = useState<Category>('property');
  const [caption, setCaption] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
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
    setProgress({ done: 0, total: files.length });
    const { data: { user } } = await supabase.auth.getUser();
    const cap = caption.trim() || null;
    let failed = 0;

    const uploadOne = async (file: File) => {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${portalId}/${category}/${crypto.randomUUID()}_${safe}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (up.error) {
        failed++;
        toast({ title: `Upload failed: ${file.name}`, description: up.error.message, variant: 'destructive' });
      } else {
        const { error } = await supabase.from('portal_photos').insert({
          portal_id: portalId,
          file_path: path,
          caption: cap,
          category,
          uploaded_by: user?.id,
        });
        if (error) {
          failed++;
          toast({ title: 'Record failed', description: error.message, variant: 'destructive' });
        }
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    };

    // Upload with limited concurrency so large batches finish fast without stalling.
    const CONCURRENCY = 4;
    const queue = [...files];
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length) {
          const next = queue.shift();
          if (next) await uploadOne(next);
        }
      })
    );

    setUploading(false);
    setProgress({ done: 0, total: 0 });
    setCaption('');
    if (inputRef.current) inputRef.current.value = '';
    const ok = files.length - failed;
    if (ok > 0) toast({ title: `Uploaded ${ok} photo${ok !== 1 ? 's' : ''}` });
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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const deleteSelected = async () => {
    const targets = photos.filter((p) => selected.has(p.id));
    if (!targets.length) return;
    if (!confirm(`Delete ${targets.length} selected photo${targets.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    await supabase.storage.from(BUCKET).remove(targets.map((p) => p.file_path));
    const { error } = await supabase.from('portal_photos').delete().in('id', targets.map((p) => p.id));
    setBulkDeleting(false);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Deleted ${targets.length} photo${targets.length > 1 ? 's' : ''}` });
      exitSelecting();
    }
    load();
  };

  const property = photos.filter((p) => p.category === 'property');
  const milestone = photos.filter((p) => p.category === 'milestone');

  const Section = ({ title, icon, list }: { title: string; icon: React.ReactNode; list: PortalPhoto[] }) => (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
          {icon}
        </div>
        <div>
          <p className="eyebrow leading-none">Gallery</p>
          <h3 className="font-display text-xl font-semibold tracking-tight mt-0.5">{title}</h3>
        </div>
        <div className="flex-1 h-px divider-hair ml-2" />
        <span className="text-xs text-muted-foreground tabular-nums">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">
          No {title.toLowerCase()} yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {list.map((p) => (
            <figure key={p.id} className="group relative">
              <PhotoThumb
                path={p.file_path}
                caption={p.caption}
                onOpen={setLightbox}
                selecting={selecting}
                selected={selected.has(p.id)}
                onToggle={() => toggleSelect(p.id)}
              />
              {!selecting && (
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full bg-background/95 hover:bg-background shadow-md" onClick={() => downloadPhoto(p)} title="Download">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {canManage && (
                    <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full bg-background/95 hover:bg-background shadow-md" onClick={() => del(p)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              )}
            </figure>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-8">
      {canManage && (
        <div className="rounded-2xl border border-border/70 bg-card p-4 space-y-3 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger className="sm:w-48 rounded-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="property">Property Photos</SelectItem>
                <SelectItem value="milestone">Milestone Photos</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} className="rounded-full" />
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full flex flex-col items-center justify-center h-24 border-2 border-dashed border-primary/30 rounded-xl bg-primary/[0.03] hover:bg-primary/[0.06] hover:border-primary/50 transition-all group"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 group-hover:scale-105 transition-transform">
                <Upload className="h-4 w-4" />
              </div>
            )}
            <span className="mt-1.5 text-xs font-medium text-foreground">
              Upload {category} photos
            </span>
            <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={onUpload} />
          </button>
        </div>
      )}

      {canManage && !loading && photos.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-2.5 shadow-sm">
          {selecting ? (
            <>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium tabular-nums">{selected.size} selected</span>
                <button
                  type="button"
                  onClick={() => setSelected(selected.size === photos.length ? new Set() : new Set(photos.map((p) => p.id)))}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {selected.size === photos.length ? 'Clear all' : 'Select all'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="rounded-full" onClick={exitSelecting}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-full"
                  disabled={selected.size === 0 || bulkDeleting}
                  onClick={deleteSelected}
                >
                  {bulkDeleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                  Delete {selected.size > 0 ? `(${selected.size})` : ''}
                </Button>
              </div>
            </>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setSelecting(true)}>
                <CheckSquare className="h-4 w-4 mr-1.5" /> Select
              </Button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="aspect-[4/3] rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : photos.length === 0 ? (
        <div className="luxe-card p-12 flex flex-col items-center justify-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 mb-4">
            <ImageIcon className="h-6 w-6" />
          </div>
          <h3 className="font-display text-lg font-semibold tracking-tight mb-1">
            No photos yet
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {canManage ? 'Upload the first photo above to share it with your client.' : 'Your agent will add photos here soon.'}
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          <Section title="Property Photos" icon={<Home className="h-4 w-4" />} list={property} />
          <Section title="Milestone Photos" icon={<Trophy className="h-4 w-4" />} list={milestone} />
        </div>
      )}

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 border-0 bg-black/95 gap-0 flex items-center justify-center">
          {lightbox && (
            <img src={lightbox} alt="" className="max-w-full max-h-full object-contain animate-fade-in" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}