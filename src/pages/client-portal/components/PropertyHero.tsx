import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PortalProperty, propertyLabel, ROLE_LABEL } from '@/hooks/usePortalProperties';

const BUCKET = 'portal-photos';

/**
 * Full-width cover banner shown at the top of the client portal when a
 * property is selected. Uses the property's chosen cover photo (a storage
 * path in the private portal-photos bucket, signed on demand) and falls back
 * to the legacy cover_photo_url if one was pasted in manually.
 */
export function PropertyHero({ property }: { property: PortalProperty }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setUrl(null);
    if (property.cover_photo_path) {
      supabase.storage
        .from(BUCKET)
        .createSignedUrl(property.cover_photo_path, 3600)
        .then(({ data }) => {
          if (mounted) setUrl(data?.signedUrl ?? null);
        });
    } else if (property.cover_photo_url) {
      setUrl(property.cover_photo_url);
    }
    return () => {
      mounted = false;
    };
  }, [property.id, property.cover_photo_path, property.cover_photo_url]);

  if (!url) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 shadow-sm">
      <img
        src={url}
        alt={propertyLabel(property)}
        className="h-48 w-full object-cover sm:h-64"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/70">
          {ROLE_LABEL[property.role]}
        </p>
        <h2 className="mt-0.5 font-display text-xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-2xl">
          {propertyLabel(property)}
        </h2>
      </div>
    </div>
  );
}
