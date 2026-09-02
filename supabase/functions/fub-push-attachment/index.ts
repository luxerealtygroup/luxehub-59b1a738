import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { getFubApiKeyForOrg } from '../_shared/fub.ts';

const FUB_BASE_URL = 'https://api.followupboss.com/v1';
const BUCKET = 'portal-documents';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Retry transient network / 5xx failures against FUB with backoff.
async function fubFetch(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** i));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      console.warn(`FUB fetch attempt ${i + 1} failed:`, (e as Error).message);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw lastErr;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const documentId = String(body.document_id ?? '').trim();
    if (!documentId) return json({ error: 'document_id required' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: doc, error: docErr } = await admin
      .from('portal_documents')
      .select('id, portal_id, file_name, file_path, file_type, fub_pushed_at, fub_attachment_id')
      .eq('id', documentId)
      .maybeSingle();

    if (docErr || !doc) return json({ error: 'Document not found' }, 404);
    if (doc.fub_pushed_at || doc.fub_attachment_id) {
      return json({ skipped: 'already_pushed' });
    }

    const { data: portal } = await admin
      .from('client_accounts')
      .select('id, fub_person_id, org_id')
      .eq('id', doc.portal_id)
      .maybeSingle();

    // No FUB link -> skip silently.
    if (!portal?.fub_person_id) return json({ skipped: 'no_fub_link' });

    // Scoped to the portal's own organization — never another team's CRM.
    const apiKey = await getFubApiKeyForOrg(portal.org_id ?? null);
    if (!apiKey) {
      console.warn('fub-push-attachment: Follow Up Boss is not connected for this team');
      return json({ skipped: 'no_api_key' });
    }

    // Download the file with service-role access; the bucket stays private.
    const { data: fileBlob, error: dlErr } = await admin.storage.from(BUCKET).download(doc.file_path);
    if (dlErr || !fileBlob) {
      const msg = dlErr?.message ?? 'download failed';
      console.error('fub-push-attachment download error:', msg);
      await admin.from('portal_documents').update({ fub_push_error: msg }).eq('id', doc.id);
      return json({ error: msg }, 200);
    }

    const form = new FormData();
    form.append('personId', String(portal.fub_person_id));
    form.append(
      'file',
      new File([fileBlob], doc.file_name, { type: doc.file_type || 'application/octet-stream' }),
    );

    const res = await fubFetch(`${FUB_BASE_URL}/personAttachments`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${apiKey}:`)}`,
        'X-System': 'Lovable Real Estate Hub',
        'X-System-Key': 'lovable-hub',
      },
      body: form,
    });

    const text = await res.text();
    if (!res.ok) {
      console.error(`fub-push-attachment FUB ${res.status}: ${text.slice(0, 500)}`);
      await admin
        .from('portal_documents')
        .update({ fub_push_error: `FUB ${res.status}: ${text.slice(0, 300)}` })
        .eq('id', doc.id);
      return json({ error: 'fub_error', status: res.status }, 200);
    }

    let attachmentId: number | null = null;
    try {
      const parsed = JSON.parse(text);
      attachmentId = typeof parsed?.id === 'number' ? parsed.id : null;
    } catch {
      // FUB returned a non-JSON success body; treat as pushed.
    }

    await admin
      .from('portal_documents')
      .update({
        fub_attachment_id: attachmentId,
        fub_pushed_at: new Date().toISOString(),
        fub_push_error: null,
      })
      .eq('id', doc.id);

    console.log(`fub-push-attachment: pushed ${doc.file_name} to person ${portal.fub_person_id}`);
    return json({ success: true, attachment_id: attachmentId });
  } catch (e) {
    console.error('fub-push-attachment unexpected error:', (e as Error).message);
    return json({ error: (e as Error).message }, 200);
  }
});
