import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Image } from 'lucide-react';

interface ImageThumbnailProps {
  bucket: string;
  filePath: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}

export const ImageThumbnail = ({ 
  bucket, 
  filePath, 
  alt, 
  className = "h-20 w-full object-cover rounded-lg",
  fallbackClassName = "h-5 w-5 text-green-600"
}: ImageThumbnailProps) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchSignedUrl = async () => {
      try {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(filePath, 3600); // 1 hour expiry

        if (error) {
          console.error('Error creating signed URL:', error);
          setError(true);
        } else if (data?.signedUrl) {
          setSignedUrl(data.signedUrl);
        }
      } catch (err) {
        console.error('Failed to fetch signed URL:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchSignedUrl();
  }, [bucket, filePath]);

  if (loading) {
    return (
      <div className={`${className} bg-muted animate-pulse flex items-center justify-center`}>
        <Image className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  if (error || !signedUrl) {
    return (
      <div className={`${className} bg-muted flex items-center justify-center`}>
        <Image className={fallbackClassName} />
      </div>
    );
  }

  return (
    <img 
      src={signedUrl} 
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  );
};
