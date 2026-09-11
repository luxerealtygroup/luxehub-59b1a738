import { useState } from 'react';
import { Home } from 'lucide-react';
import { ReportListing, money } from '@/lib/openHouse/reports';

/**
 * A listing sells on its photo, so the photo is the biggest thing on the card.
 * A missing or broken image falls back to a plain neutral panel of the same
 * size — the grid never shifts and nothing ever renders as a broken image.
 */
export function ListingPhoto({
  url,
  alt,
  className = 'aspect-[4/3] w-full',
}: {
  url: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const show = url && !failed;
  return (
    <div className={`relative overflow-hidden bg-muted ${className}`}>
      {show ? (
        <img
          src={url!}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Home className="h-8 w-8 opacity-40" />
          <span className="sr-only">No photo for this listing</span>
        </div>
      )}
    </div>
  );
}

export function ListingCard({
  listing,
  action,
}: {
  listing: ReportListing;
  action?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <ListingPhoto url={listing.photo_url} alt={listing.address} />
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{listing.address}</p>
          <p className="text-sm text-muted-foreground">{money(listing.price)}</p>
          {listing.link && (
            <a
              href={listing.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm text-gold underline"
            >
              View listing
            </a>
          )}
        </div>
        {action}
      </div>
    </div>
  );
}
