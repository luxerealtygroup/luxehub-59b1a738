import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, FileText, Image, File } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { checkFiles, formatFileSize as prettySize } from '@/lib/uploads';
import { UploadPickers } from '@/components/uploads/UploadPickers';


interface FileUploadProps {
  files: File[];
  setFiles: (files: File[]) => void;
  maxFiles?: number;
}

export function FileUpload({ files, setFiles, maxFiles = 10 }: FileUploadProps) {
  const [dragging, setDragging] = useState(false);


  const addFiles = (selectedFiles: File[]) => {
    if (!selectedFiles.length) return;

    const { accepted, errors } = checkFiles(selectedFiles, { maxSizeMB: 25 });
    errors.forEach((message) => toast.error(message));
    if (!accepted.length) return;

    const room = maxFiles - files.length;
    if (room <= 0) {
      toast.error(`Maximum ${maxFiles} files allowed`);
      return;
    }
    if (accepted.length > room) {
      toast.error(`Only ${room} more file${room === 1 ? '' : 's'} can be added (max ${maxFiles}).`);
    }

    setFiles([...files, ...accepted.slice(0, room)]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []));

    // Reset input so the same file can be selected again
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <Image className="h-4 w-4 text-blue-500" />;
    }
    if (file.type === 'application/pdf') {
      return <FileText className="h-4 w-4 text-red-500" />;
    }
    return <File className="h-4 w-4 text-muted-foreground" />;
  };

  const formatFileSize = prettySize;

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(Array.from(e.dataTransfer.files || []));
        }}
        className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${dragging ? 'bg-muted border-primary/60' : 'hover:bg-muted/50'}`}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <span className="mt-1 text-sm text-muted-foreground">
          Click to upload files (max {maxFiles})
        </span>
        <span className="text-xs text-muted-foreground">
          PDF, Word, Excel, CSV, photos (incl. HEIC) — up to 25MB each
        </span>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept={ACCEPT_DOCUMENTS}
          onChange={handleFileChange}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 bg-muted rounded-lg"
            >
              <div className="flex items-center gap-2 min-w-0">
                {getFileIcon(file)}
                <span className="text-sm truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({formatFileSize(file.size)})
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeFile(index)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper function to upload files and return paths
export async function uploadSubmissionFiles(
  files: File[],
  userId: string,
  formType: string
): Promise<string[]> {
  const uploadedPaths: string[] = [];

  for (const file of files) {
    const fileExt = file.name.split('.').pop();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${crypto.randomUUID()}_${sanitizedName}`;
    const filePath = `submissions/${formType}/${userId}/${fileName}`;

    const { error } = await supabase.storage
      .from('client-documents')
      .upload(filePath, file);

    if (error) {
      console.error('Upload error:', error);
      throw new Error(`Failed to upload ${file.name}`);
    }

    uploadedPaths.push(filePath);
  }

  return uploadedPaths;
}

// Helper function to copy submission files to client documents library
export async function copyFilesToClientDocuments(
  files: File[],
  filePaths: string[],
  userId: string,
  clientName: string,
  fubPersonId: number | null,
  documentType: 'Buyer Documents' | 'Listing Documents'
): Promise<void> {
  if (!fubPersonId || files.length === 0) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = filePaths[i];
    
    const { error } = await supabase.from('client_documents').insert({
      title: file.name,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      file_type: file.type || null,
      document_type: documentType,
      client_name: clientName,
      fub_person_id: fubPersonId,
      uploaded_by: userId,
    });

    if (error) {
      console.error('Error creating client document record:', error);
      // Don't throw - the file is already uploaded, just log the error
    }
  }
}

// Helper function to get signed URLs for uploaded files (works with private buckets)
export async function getFilePublicUrls(
  files: File[],
  filePaths: string[]
): Promise<Array<{ url: string; name: string; path: string }>> {
  const results: Array<{ url: string; name: string; path: string }> = [];
  
  for (let i = 0; i < filePaths.length; i++) {
    const path = filePaths[i];
    // Create a signed URL that expires in 1 hour (enough time for Asana to download)
    const { data, error } = await supabase.storage
      .from('client-documents')
      .createSignedUrl(path, 3600); // 1 hour expiry
    
    if (!data?.signedUrl) {
      console.error('Failed to create signed URL for:', path, error);
    }
    // Always include the storage path so the Asana function can download the
    // file server-side (service role) even if the signed URL is missing/expired.
    results.push({
      url: data?.signedUrl || '',
      name: files[i]?.name || path.split('/').pop() || 'file',
      path,
    });
  }
  
  return results;
}
