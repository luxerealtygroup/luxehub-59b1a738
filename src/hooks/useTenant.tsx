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
import { useOrgPreviewBranding } from '@/hooks/useOrgPreview';

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
  /** True when this org has Follow Up Boss connected (or is the original instance). */
  fubEnabled: boolean;
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
  fubEnabled: true,
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

/** Nudge an "H S% L%" string lighter or darker, clamped to 4–96% lightness. */
function shiftLightness(hsl: string, delta: number): string {
  const parts = hsl.split(' ');
  const l = parseFloat(parts[2]);
  if (Number.isNaN(l)) return hsl;
  return `${parts[0]} ${parts[1]} ${Math.min(96, Math.max(4, Math.round(l + delta)))}%`;
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
        fubEnabled: true, // refined by the integration check below
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
            fubEnabled: false,
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

  // Resolve Follow Up Boss availability for the signed-in org. The original
  // instance keeps working off its environment key; other orgs must have
  // connected their own key at /dashboard/setup.
  const [fubEnabled, setFubEnabled] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user || !value.orgId) return;
      if (value.isDefaultTenant) {
        if (!cancelled) setFubEnabled(true);
        return;
      }
      const { data } = await supabase.rpc('org_has_integration', { _key: 'FUB_API_KEY' });
      if (!cancelled) setFubEnabled(Boolean(data));
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [user, value.orgId, value.isDefaultTenant]);

  // While a super-admin previews another team, the whole app renders with that
  // team's identity. This is display only — data access is unchanged and still
  // scoped to the signed-in org by RLS.
  const previewBranding = useOrgPreviewBranding();
  const memo = useMemo<TenantBranding>(() => {
    if (previewBranding) {
      return {
        orgId: previewBranding.orgId,
        slug: previewBranding.slug,
        name: previewBranding.name,
        appName: previewBranding.appName || previewBranding.name,
        shortName: previewBranding.shortName || previewBranding.name.split(' ')[0],
        brokerageName: previewBranding.brokerageName || previewBranding.name,
        primaryColor: previewBranding.primaryColor,
        textColor: previewBranding.textColor ?? previewBranding.primaryColor,
        logoUrl: previewBranding.logoUrl,
        markUrl: previewBranding.markUrl,
        isDefaultTenant: false,
        fubEnabled: previewBranding.fubEnabled,
        isLoading: false,
      };
    }
    return { ...value, fubEnabled };
  }, [value, fubEnabled, previewBranding]);

  // Push brand colours into the design system as CSS variables.
  //
  // The LUXE theme paints accents with the `gold` token family, so a tenant
  // brand has to override those too — otherwise another team's login page
  // renders LUXE gold buttons. Only non-default tenants override; LUXE keeps
  // its own palette untouched.
  useEffect(() => {
    const root = document.documentElement;
    const primary = memo.primaryColor ? hexToHsl(memo.primaryColor) : null;
    const text = memo.textColor ? hexToHsl(memo.textColor) : null;
    if (primary) root.style.setProperty('--tenant-brand', primary);
    else root.style.removeProperty('--tenant-brand');
    if (text) {
      root.style.setProperty('--tenant-brand-text', text);
      root.style.setProperty('--tenant-brand-foreground', '0 0% 100%');
    } else {
      root.style.removeProperty('--tenant-brand-text');
      root.style.removeProperty('--tenant-brand-foreground');
    }

    const themed = ['--primary', '--gold', '--gold-light', '--gold-dark', '--ring', '--sidebar-primary'];
    if (!memo.isDefaultTenant && primary) {
      const accent = text ?? primary;
      root.style.setProperty('--primary', accent);
      root.style.setProperty('--primary-foreground', '0 0% 100%');
      root.style.setProperty('--gold', accent);
      root.style.setProperty('--gold-light', shiftLightness(primary, 16));
      root.style.setProperty('--gold-dark', shiftLightness(accent, -14));
      root.style.setProperty('--ring', accent);
      root.style.setProperty('--sidebar-primary', accent);
      root.style.setProperty('--sidebar-primary-foreground', '0 0% 100%');
    } else {
      themed.forEach((v) => root.style.removeProperty(v));
      root.style.removeProperty('--primary-foreground');
      root.style.removeProperty('--sidebar-primary-foreground');
    }
  }, [memo.primaryColor, memo.textColor, memo.isDefaultTenant]);


  return <TenantContext.Provider value={memo}>{children}</TenantContext.Provider>;

}

export const useTenant = () => useContext(TenantContext);

/** Convenience: hide Follow Up Boss driven UI for orgs without a connected key. */
export const useFubEnabled = () => useContext(TenantContext).fubEnabled;
