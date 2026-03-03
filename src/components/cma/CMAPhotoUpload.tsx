import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera, X, Star, Upload } from 'lucide-react';
import { toast } from 'sonner';

interface CMAPhotoUploadProps {
  photos: File[];
  setPhotos: (photos: File[]) => void;
  coverIndex: number;
  setCoverIndex: (index: number) => void;
  maxPhotos?: number;
}

const CMAPhotoUpload = ({
  photos,
  setPhotos,
  coverIndex,
  setCoverIndex,
  maxPhotos = 10,
}: CMAPhotoUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const imageFiles = selected.filter(f => f.type.startsWith('image/'));

    if (imageFiles.length !== selected.length) {
      toast.error('Only image files (JPG, PNG, WebP) are accepted');
    }

    if (photos.length + imageFiles.length > maxPhotos) {
      toast.error(`Maximum ${maxPhotos} photos allowed`);
      return;
    }

    const newPhotos = [...photos, ...imageFiles];
    setPhotos(newPhotos);

    // Generate previews for new files
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPreviews(prev => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });

    if (inputRef.current) inputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    const updated = photos.filter((_, i) => i !== index);
    const updatedPreviews = previews.filter((_, i) => i !== index);
    setPhotos(updated);
    setPreviews(updatedPreviews);

    // Adjust cover index
    if (coverIndex === index) {
      setCoverIndex(0);
    } else if (coverIndex > index) {
      setCoverIndex(coverIndex - 1);
    }
  };

  return (
    <Card className="border-gold/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Camera className="h-4 w-4 text-gold" /> Subject Property Photos
          <span className="text-xs text-muted-foreground font-normal">(optional, up to {maxPhotos})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Upload zone */}
        <div
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors border-gold/20"
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span className="mt-1 text-xs text-muted-foreground">
            Click to upload photos ({photos.length}/{maxPhotos})
          </span>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={handleFileChange}
          />
        </div>

        {/* Photo grid */}
        {photos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {previews.map((src, i) => (
              <div
                key={i}
                className={`relative group rounded-lg overflow-hidden border-2 aspect-square cursor-pointer ${
                  i === coverIndex ? 'border-gold ring-2 ring-gold/30' : 'border-border'
                }`}
                onClick={() => setCoverIndex(i)}
              >
                <img
                  src={src}
                  alt={`Property photo ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                {/* Cover badge */}
                {i === coverIndex && (
                  <Badge className="absolute top-1 left-1 text-[8px] py-0 px-1 bg-gold text-gold-foreground">
                    <Star className="h-2 w-2 mr-0.5" /> Cover
                  </Badge>
                )}
                {/* Remove button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 h-5 w-5 p-0 bg-background/80 hover:bg-destructive hover:text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePhoto(i);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
                {/* Click hint */}
                {i !== coverIndex && (
                  <div className="absolute inset-0 bg-background/0 group-hover:bg-background/20 transition-colors flex items-end justify-center pb-1">
                    <span className="text-[8px] text-foreground/80 opacity-0 group-hover:opacity-100 transition-opacity bg-background/70 px-1 rounded">
                      Set as cover
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {photos.length > 0 && (
          <p className="text-[10px] text-muted-foreground">
            Click a photo to set it as the cover image for the client report.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default CMAPhotoUpload;
