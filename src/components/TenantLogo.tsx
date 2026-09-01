/**
 * Tenant logo slot.
 *
 * Wide lockups (e.g. a ~2.3:1 wordmark) must never be squashed: the image is
 * constrained by HEIGHT and the width scales freely. When the tenant has no
 * logo we fall back to a neutral text wordmark, never another brand's colours.
 */
import { useTenant } from '@/hooks/useTenant';
import { cn } from '@/lib/utils';

interface Props {
  /** Rendered height in px. Width scales to the artwork's aspect ratio. */
  height?: number;
  /** Use the square mark instead of the wide lockup. */
  variant?: 'lockup' | 'mark';
  className?: string;
}

export function TenantLogo({ height = 32, variant = 'lockup', className }: Props) {
  const t = useTenant();
  const src = variant === 'mark' ? t.markUrl ?? t.logoUrl : t.logoUrl;

  if (src) {
    return (
      <img
        src={src}
        alt={`${t.brokerageName} logo`}
        style={{ height, width: 'auto', maxWidth: '100%' }}
        className={cn('object-contain', variant === 'mark' && 'rounded-md', className)}
      />
    );
  }

  return (
    <span
      className={cn('font-semibold tracking-tight text-foreground', className)}
      style={{ fontSize: Math.max(14, Math.round(height * 0.5)) }}
    >
      {variant === 'mark' ? t.shortName : t.appName}
    </span>
  );
}

export default TenantLogo;
