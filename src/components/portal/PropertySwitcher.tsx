import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Home, ShoppingCart, Star, Tag } from 'lucide-react';
import { PortalProperty, propertyLabel } from '@/hooks/usePortalProperties';
import { PortalScope } from '@/lib/portalScope';

function roleIcon(role: PortalProperty['role']) {
  if (role === 'purchase') return <ShoppingCart className="h-4 w-4" />;
  if (role === 'watching') return <Star className="h-4 w-4" />;
  return <Tag className="h-4 w-4" />;
}

interface Props {
  properties: PortalProperty[];
  value: PortalScope;
  onChange: (scope: PortalScope) => void;
  className?: string;
}

/**
 * Property picker shown at the top of a portal. "All" shows everything,
 * "General" shows only portal-wide items (anything not tied to a property).
 */
export function PropertySwitcher({ properties, value, onChange, className }: Props) {
  if (!properties.length) return null;

  return (
    <Select value={value} onValueChange={(v) => onChange(v as PortalScope)}>
      <SelectTrigger
        className={`h-11 min-w-[220px] sm:min-w-[280px] rounded-full border-border/70 bg-background shadow-sm hover:border-primary/40 focus:ring-2 focus:ring-primary/30 transition-colors ${className ?? ''}`}
      >
        <SelectValue placeholder="Select a property" />
      </SelectTrigger>
      <SelectContent className="rounded-xl">
        <SelectItem value="all" className="rounded-lg">
          <span className="flex items-center gap-2">
            <Home className="h-4 w-4 text-primary" /> All properties
          </span>
        </SelectItem>
        <SelectItem value="general" className="rounded-lg">
          <span className="flex items-center gap-2">
            <Home className="h-4 w-4 text-muted-foreground" /> General (portal-wide)
          </span>
        </SelectItem>
        {properties.map((p) => (
          <SelectItem key={p.id} value={p.id} className="rounded-lg">
            <span className="flex items-center gap-2">
              <span className="text-primary">{roleIcon(p.role)}</span>
              <span className="truncate">{propertyLabel(p)}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
