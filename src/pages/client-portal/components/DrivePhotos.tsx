import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ImageIcon, Download, Loader2 } from 'lucide-react';
import type { DriveFile } from './DriveDocuments';

interface DrivePhotosProps {
  folderId: string | null | undefined;
}

const SECTIONS: Array<{ key: 'property' | 'milestones'; label: string; path: string }> = [
  { key: 'property', label: 'Property Photos', path: 'Photos/Property' },
  { key: 'milestones', label: 'Milestone Photos', path: 'Photos/Milestones' },
];

const FUNCTION_URL = 'https://sxpfxmlxegpmfamlmjyg.supabase.co/functions/v1/google-drive-files';

export function DrivePhotos({ folderId }: DrivePhotosProps) {
  const [sections, setSections] = useState<Record<string, DriveFile[]>>({});
  const [loading, setLoading] = useState(true);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ file: DriveFile; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const { toast } = useToast();

  const fetchImage = useCallback(
    async (fileId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const resp = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'download', folder_id: folderId, file_id: fileId }),
      });
      if (!resp.ok) throw new Error(`Failed to load (${resp.status})`);
      const blob = await resp.blob();
      return URL.createObjectURL(blob);
    },
    [folderId],
  );

  const load = useCallback(async () => {
    if (!folderId) {
      setSections({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const results: Record<string, DriveFile[]> = {};
    await Promise.all(
      SECTIONS.map(async (s) => {
        const { data, error } = await supabase.functions.invoke('google-drive-files', {
          body: { action: 'list_subfolder', folder_id: folderId, subfolder: s.path },
        });
        if (error) {
          results[s.key] = [];
          return;
        }
        const files = ((data as { files?: DriveFile[] }).files ?? []).filter((f) =>
          f.mimeType.startsWith('image/'),
        );
        results[s.key] = files;
      }),
    );
    setSections(results);
    setLoading(false);

    // Load thumbnails one by one to render inline.
    const allFiles = Object.values(results).flat();
    for (const f of allFiles) {
      try {
        const url = await fetchImage(f.id);
        setThumbs((prev) => ({ ...prev, [f.id]: url }));
      } catch {
        // ignore
      }
    }
  }, [folderId, fetchImage]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  const openPreview = async (file: DriveFile) => {
    setPreviewLoading(true);
    try {
      const cached = thumbs[file.id];
      const url = cached ?? (await fetchImage(file.id));
      // If cached, we already have a blob URL but we want a fresh one for download reliability.
      setPreview({ file, url });
    } catch (err) {
      toast({ title: 'Could not open photo', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadPreview = () => {
    if (!preview) return;
    const a = document.createElement('a');
    a.href = preview.url;
    a.download = preview.file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!folderId) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <ImageIcon className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">No photos yet</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Your agent will add photos here soon.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full" />
        ))}
      </div>
    );
  }

  const totalPhotos = Object.values(sections).reduce((acc, arr) => acc + arr.length, 0);
  if (!totalPhotos) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <ImageIcon className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">No photos yet</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Your agent will add photos here soon.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-10">
      {SECTIONS.map((section) => {
        const files = sections[section.key] ?? [];
        return (
          <div key={section.key}>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              {section.label}
              <span className="text-muted-foreground text-sm font-normal">
                ({files.length} {files.length === 1 ? 'photo' : 'photos'})
              </span>
            </h3>
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">No photos in this section yet.</p>
            ) : (
              <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {files.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => openPreview(file)}
                    className="group relative aspect-square overflow-hidden rounded-lg bg-muted hover:ring-2 hover:ring-primary transition"
                  >
                    {thumbs[file.id] ? (
                      <img
                        src={thumbs[file.id]}
                        alt={file.name}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{preview?.file.name}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg overflow-auto max-h-[70vh] flex items-center justify-center">
                <img src={preview.url} alt={preview.file.name} className="max-w-full h-auto" />
              </div>
              <div className="flex justify-end">
                <Button onClick={downloadPreview} variant="outline" className="gap-2">
                  {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}