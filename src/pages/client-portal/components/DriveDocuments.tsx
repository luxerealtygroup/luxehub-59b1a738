import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  FolderOpen,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileVideo,
  FileAudio,
  FileArchive,
  File as FileIcon,
  Download,
  Eye,
  Loader2,
} from 'lucide-react';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  thumbnailLink?: string;
}

interface DriveDocumentsProps {
  folderId: string | null | undefined;
}

const isImage = (m: string) => m.startsWith('image/');
const isPdf = (m: string) => m === 'application/pdf';

function iconFor(mime: string) {
  if (isImage(mime)) return FileImage;
  if (isPdf(mime)) return FileText;
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return FileSpreadsheet;
  if (mime.startsWith('video/')) return FileVideo;
  if (mime.startsWith('audio/')) return FileAudio;
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar')) return FileArchive;
  if (mime.includes('document') || mime.startsWith('text/')) return FileText;
  return FileIcon;
}

function formatSize(bytes?: string) {
  if (!bytes) return '';
  const b = Number(bytes);
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function DriveDocuments({ folderId }: DriveDocumentsProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ file: DriveFile; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!folderId) {
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('google-drive-files', {
      body: { action: 'list', folder_id: folderId },
    });
    if (error) {
      toast({ title: 'Could not load documents', description: error.message, variant: 'destructive' });
      setFiles([]);
    } else {
      setFiles(((data as { files?: DriveFile[] }).files ?? []));
    }
    setLoading(false);
  }, [folderId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openFile = async (file: DriveFile) => {
    setPreviewLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const resp = await fetch(
        `https://sxpfxmlxegpmfamlmjyg.supabase.co/functions/v1/google-drive-files`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'download', folder_id: folderId, file_id: file.id }),
        },
      );
      if (!resp.ok) throw new Error(`Download failed (${resp.status})`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);

      if (isImage(file.mimeType) || isPdf(file.mimeType)) {
        setPreview({ file, url });
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Could not open file', description: msg, variant: 'destructive' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadFromPreview = () => {
    if (!preview) return;
    const a = document.createElement('a');
    a.href = preview.url;
    a.download = preview.file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  if (!folderId) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <FolderOpen className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">No documents yet</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Your agent will add your documents here soon.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (!files.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <FolderOpen className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">No documents yet</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Your agent will add your documents here soon.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {files.map((file) => {
          const Icon = iconFor(file.mimeType);
          const previewable = isImage(file.mimeType) || isPdf(file.mimeType);
          return (
            <Card key={file.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3 mb-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium truncate" title={file.name}>{file.name}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                      <span>{formatSize(file.size)}</span>
                      <span>{format(new Date(file.modifiedTime), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => openFile(file)}
                  disabled={previewLoading}
                  className="w-full gap-2"
                  variant="outline"
                >
                  {previewLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : previewable ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {previewable ? 'Preview' : 'Download'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && closePreview()}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{preview?.file.name}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg overflow-auto max-h-[70vh] flex items-center justify-center">
                {isImage(preview.file.mimeType) ? (
                  <img src={preview.url} alt={preview.file.name} className="max-w-full h-auto" />
                ) : (
                  <iframe src={preview.url} title={preview.file.name} className="w-full h-[70vh]" />
                )}
              </div>
              <div className="flex justify-end">
                <Button onClick={downloadFromPreview} variant="outline" className="gap-2">
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}