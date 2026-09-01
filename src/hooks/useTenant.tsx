/**
 * Runtime tenant resolution.
 *
 * Order of precedence:
 *   1. The signed-in user's organization row (authoritative once a JWT exists)
 *   2. The request hostname — <slug>.luxerealtyhub.com or a custom domain —
 *      resolved through the public `tenant-branding` function so signed-out
 *      pages are branded too
 *   3. The build-time tenant config in src/config/tenant.ts (LUXE defaults)
 *
 * Branding is applied as CSS custom properties so components keep using
 * semantic tokens instead of hardcoded colours.
 */
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { tenant as staticTenant } from '@/config/tenant';

export interface TenantBranding {
  orgId: string | null;
  slug: string | null;
  name: string;
  appName: string;
  shortName: string;
  brokerageName: string;
  /** Brand colour for the mark and large accents. May fail small-text contrast. */
  primaryColor: string | null;
  /** Accessible shade for body text, links, small labels and filled buttons. */
  textColor: string | null;
  /** Wide lockup — constrain by height, let width scale. */
  logoUrl: string | null;
  /** Square mark for avatars and favicons. */
  markUrl: string | null;
  isDefaultTenant: boolean;
  isLoading: boolean;
}

const fallback: TenantBranding = {
  orgId: null,
  slug: null,
  name: staticTenant.brokerageName,
  appName: staticTenant.appName,
  shortName: staticTenant.shortName,
  brokerageName: staticTenant.brokerageName,
  primaryColor: null,
  textColor: null,
  logoUrl: null,
  markUrl: null,
  isDefaultTenant: true,
  isLoading: true,
};

const TenantContext = createContext<TenantBranding>(fallback);

/** #RRGGBB -> "H S% L%" for CSS custom properties. */
function hexToHsl(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

interface Row {
  id: string;
  slug: string | null;
  name: string | null;
  app_name: string | null;
  short_name: string | null;
  brokerage_name: string | null;
  branding_primary_color: string | null;
  branding_text_color: string | null;
  branding_logo_url: string | null;
  branding_mark_url: string | null;
  is_original_org?: boolean | null;
}

async function signBrandingUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const { data } = await supabase.storage.from('org-branding').createSignedUrl(path, 60 * 60 * 12);
  return data?.signedUrl ?? null;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [value, setValue] = useState<TenantBranding>(fallback);

  useEffect(() => {
    let cancelled = false;

    const applyRow = async (row: Row) => {
      const resolved: TenantBranding = {
        orgId: row.id,
        slug: row.slug,
        name: row.name || staticTenant.brokerageName,
        appName: row.app_name || row.name || staticTenant.appName,
        shortName: row.short_name || row.name?.split(' ')[0] || staticTenant.shortName,
        brokerageName: row.brokerage_name || row.name || staticTenant.brokerageName,
        primaryColor: row.branding_primary_color,
        textColor: row.branding_text_color || row.branding_primary_color,
        logoUrl: await signBrandingUrl(row.branding_logo_url),
        markUrl: await signBrandingUrl(row.branding_mark_url),
        isDefaultTenant: Boolean(row.is_original_org),
        isLoading: false,
      };
      if (!cancelled) setValue(resolved);
    };

    const run = async () => {
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('org_id')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.org_id) {
          const { data } = await supabase
            .from('organizations')
            .select(
              'id, slug, name, app_name, short_name, brokerage_name, branding_primary_color, branding_text_color, branding_logo_url, branding_mark_url, is_original_org',
            )
            .eq('id', profile.org_id)
            .maybeSingle();
          if (data) {
            await applyRow(data as Row);
            return;
          }
        }
      }

      // Signed out (or no org yet): resolve from the hostname.
      try {
        const { data } = await supabase.functions.invoke('tenant-branding', {
          body: { host: window.location.hostname },
        });
        const org = data?.org;
        if (org && !cancelled) {
          setValue({
            orgId: org.id,
            slug: org.slug ?? null,
            name: org.name || staticTenant.brokerageName,
            appName: org.appName || org.name || staticTenant.appName,
            shortName: org.shortName || staticTenant.shortName,
            brokerageName: org.brokerageName || org.name || staticTenant.brokerageName,
            primaryColor: org.primaryColor ?? null,
            textColor: org.textColor ?? org.primaryColor ?? null,
            logoUrl: org.logoUrl ?? null,
            markUrl: org.markUrl ?? null,
            isDefaultTenant: false,
            isLoading: false,
          });
          return;
        }
      } catch {
        // Fall through to the built-in defaults.
      }

      if (!cancelled) setValue({ ...fallback, isLoading: false });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Push brand colours into the design system as CSS variables.
  useEffect(() => {
    const root = document.documentElement;
    const primary = value.primaryColor ? hexToHsl(value.primaryColor) : null;
    const text = value.textColor ? hexToHsl(value.textColor) : null;
    if (primary) root.style.setProperty('--tenant-brand', primary);
    else root.style.removeProperty('--tenant-brand');
    if (text) {
      root.style.setProperty('--tenant-brand-text', text);
      root.style.setProperty('--tenant-brand-foreground', '0 0% 100%');
    } else {
      root.style.removeProperty('--tenant-brand-text');
      root.style.removeProperty('--tenant-brand-foreground');
    }
  }, [value.primaryColor, value.textColor]);

  const memo = useMemo(() => value, [value]);
  return <TenantContext.Provider value={memo}>{children}</TenantContext.Provider>;
}

export const useTenant = () => useContext(TenantContext);
