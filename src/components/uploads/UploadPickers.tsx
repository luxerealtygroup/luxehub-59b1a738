import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, FolderOpen } from 'lucide-react';
import { ACCEPT_IMAGES } from '@/lib/uploads';

/**
 * Two pickers, one list.
 *
 * Android WebView wrappers (Median) build their chooser from the `accept`
 * list: as soon as `image/*` is mixed with document types, the chooser falls
 * back to camera/gallery only and the file browser disappears. So photos get
 * their own image-only button, and the general button carries NO accept at
 * all — that is what makes Android offer Files/Drive. Everything selected is
 * validated afterwards instead.
 */
interface UploadPickersProps {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  photosLabel?: string;
  filesLabel?: string;
  /** Hide the photo button where only documents make sense. */
  showPhotos?: boolean;
  size?: 'sm' | 'default';
  className?: string;
  variant?: 'outline' | 'secondary' | 'default';
}

export function UploadPickers({
  onFiles,
  multiple = true,
  disabled,
  photosLabel = 'Add photos',
  filesLabel = 'Add files',
  showPhotos = true,
  size = 'sm',
  className = '',
  variant = 'outline',
}: UploadPickersProps) {
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length) onFiles(picked);
    e.target.value = '';
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {showPhotos && (
        <Button
          type="button"
          variant={variant}
          size={size}
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); photoRef.current?.click(); }}
        >
          <ImageIcon className="h-4 w-4 mr-1.5" /> {photosLabel}
        </Button>
      )}
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
      >
        <FolderOpen className="h-4 w-4 mr-1.5" /> {filesLabel}
      </Button>

      <input
        ref={photoRef}
        type="file"
        className="hidden"
        multiple={multiple}
        accept={ACCEPT_IMAGES}
        onChange={handle}
      />
      {/* No accept attribute on purpose — see note above. */}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        multiple={multiple}
        onChange={handle}
      />
    </div>
  );
}

export default UploadPickers;
