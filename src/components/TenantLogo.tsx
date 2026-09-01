/**
 * Tenant logo slot.
 *
 * Rules:
 *  - Wide lockups (~2.3:1 to ~2.7:1) must never be squashed: the image is
 *    constrained by HEIGHT and the width scales freely.
 *  - Low-resolution artwork must never be upscaled. We read the image's
 *    natural height and clamp the rendered height to it.
 *  - The square mark is OPTIONAL. Some lockups (a mark wrapped around the
 *    wordmark) have no clean square crop, so avatars/favicons fall back to an
 *    initials monogram on the brand colour — never a cropped lockup.
 *  - With no logo at all we fall back to a neutral text wordmark, never
 *    another brand's colours.
 */
import { useEffect, useState } from 'react';
import { useTenant } from '@/hooks/useTenant';
import { cn } from '@/lib/utils';

interface Props {
  /** Requested height in px. Width scales to the artwork's aspect ratio. */
  height?: number;
  /** Use the square mark (avatar/favicon) instead of the wide lockup. */
  variant?: 'lockup' | 'mark';
  className?: string;
}

function initialsOf(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Monogram used when a tenant has no square mark. */
function Monogram({ size, label, color, className }: { size: number; label: string; color: string | null; className?: string }) {
  return (
    <span
      aria-label={label}
      role="img"
      className={cn('inline-flex items-center justify-center rounded-md font-semibold text-white', className)}
      style={{
        height: size,
        width: size,
        fontSize: Math.max(10, Math.round(size * 0.42)),
        backgroundColor: color ?? 'hsl(var(--primary))',
      }}
    >
      {initialsOf(label)}
    </span>
  );
}

export function TenantLogo({ height = 32, variant = 'lockup', className }: Props) {
  const t = useTenant();
  const src = variant === 'mark' ? t.markUrl : t.logoUrl;
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);

  useEffect(() => {
    setNaturalHeight(null);
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setNaturalHeight(img.naturalHeight || null);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Avatars/favicons: no square mark means a monogram, not a cropped lockup.
  if (variant === 'mark' && !src) {
    return <Monogram size={height} label={t.brokerageName || t.appName} color={t.primaryColor} className={className} />;
  }

  if (src) {
    // Never upscale low-resolution artwork.
    const renderedHeight = naturalHeight ? Math.min(height, naturalHeight) : height;
    return (
      <img
        src={src}
        alt={`${t.brokerageName} logo`}
        style={{ height: renderedHeight, width: 'auto', maxWidth: '100%' }}
        className={cn('object-contain', variant === 'mark' && 'rounded-md', className)}
      />
    );
  }

  return (
    <span
      className={cn('font-semibold tracking-tight text-foreground', className)}
      style={{ fontSize: Math.max(14, Math.round(height * 0.5)) }}
    >
      {t.appName}
    </span>
  );
}

export default TenantLogo;
