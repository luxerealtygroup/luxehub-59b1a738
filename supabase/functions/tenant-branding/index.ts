/**
 * Public tenant branding resolution.
 *
 * Signed-out pages (login, invite accept, client portal sign-in) need the right
 * brokerage name, colours and logo BEFORE a JWT exists. This function resolves
 * an organization from the request hostname (or an explicit slug) and returns
 * only non-sensitive branding fields, with short-lived signed URLs for the logo
 * files stored in the private `org-branding` bucket.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey);

    let host = '';
    let slug = '';
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      host = String(body?.host ?? '');
      slug = String(body?.slug ?? '');
    } else {
      const u = new URL(req.url);
      host = u.searchParams.get('host') ?? '';
      slug = u.searchParams.get('slug') ?? '';
    }

    let org: Record<string, unknown> | null = null;

    if (slug) {
      const { data } = await admin
        .from('organizations')
        .select(
          'id, slug, name, app_name, short_name, brokerage_name, branding_logo_url, branding_mark_url, branding_primary_color, branding_text_color',
        )
        .eq('slug', slug.toLowerCase())
        .maybeSingle();
      org = data ?? null;
    }

    if (!org && host) {
      const { data } = await admin.rpc('resolve_org_by_host', { _host: host });
      org = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
    }

    if (!org) return json({ org: null });

    const sign = async (path: unknown) => {
      const p = typeof path === 'string' ? path.trim() : '';
      if (!p) return null;
      if (p.startsWith('http')) return p;
      const { data } = await admin.storage.from('org-branding').createSignedUrl(p, 60 * 60 * 12);
      return data?.signedUrl ?? null;
    };

    return json({
      org: {
        id: org.id,
        slug: org.slug,
        name: org.name,
        appName: org.app_name,
        shortName: org.short_name,
        brokerageName: org.brokerage_name,
        primaryColor: org.branding_primary_color,
        textColor: org.branding_text_color,
        logoUrl: await sign(org.branding_logo_url),
        markUrl: await sign(org.branding_mark_url),
      },
    });
  } catch (e) {
    console.error('tenant-branding failed:', e instanceof Error ? e.message : String(e));
    return json({ org: null, error: 'Could not resolve branding' }, 500);
  }
});
