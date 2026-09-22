/**
 * Shared upload rules.
 *
 * Android WebView wrappers (Median) decide which pickers to offer purely from
 * the input's `accept` attribute — an image-only accept hides Files/Drive, so
 * PDFs and documents become unreachable. Keep accept lists broad and validate
 * after selection instead. Never use the `capture` attribute: it forces the
 * camera and removes every other source.
 */

/** Photos, including the HEIC/HEIF that iPhones produce. */
export const ACCEPT_IMAGES =
  'image/*,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif';

/** Documents and photos — the default for any general attachment field. */
export const ACCEPT_DOCUMENTS =
  'application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*,.heic,.heif';

/** PDF only, but written so Android still offers Files/Drive. */
export const ACCEPT_PDF = 'application/pdf,.pdf,*/*';

const DOC_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt',
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif',
];

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];

export const extensionOf = (name: string) =>
  (name.split('.').pop() || '').toLowerCase();

export const isImageFile = (file: File) =>
  file.type.startsWith('image/') || IMAGE_EXTENSIONS.includes(extensionOf(file.name));

export const isDocumentFile = (file: File) =>
  isImageFile(file) ||
  file.type === 'application/pdf' ||
  DOC_EXTENSIONS.includes(extensionOf(file.name));

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export interface FileCheckOptions {
  /** Max size per file in megabytes. */
  maxSizeMB?: number;
  /** Restrict to images (photo galleries) instead of any document. */
  imagesOnly?: boolean;
}

export interface FileCheckResult {
  accepted: File[];
  errors: string[];
}

/**
 * Validate after the picker returns, so the picker itself never has to be
 * restrictive. Returns the files we keep plus human-readable rejection notes.
 */
export function checkFiles(files: File[], options: FileCheckOptions = {}): FileCheckResult {
  const { maxSizeMB = 25, imagesOnly = false } = options;
  const accepted: File[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const okType = imagesOnly ? isImageFile(file) : isDocumentFile(file);
    if (!okType) {
      errors.push(
        imagesOnly
          ? `${file.name} isn't a photo we can use.`
          : `${file.name} isn't a file type we accept.`,
      );
      continue;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      errors.push(`${file.name} is ${formatFileSize(file.size)} — the limit is ${maxSizeMB}MB.`);
      continue;
    }
    accepted.push(file);
  }

  return { accepted, errors };
}
