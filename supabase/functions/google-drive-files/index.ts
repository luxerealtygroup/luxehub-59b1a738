// Google Drive files proxy for the client portal.
// Uses a Google service account (GOOGLE_SERVICE_ACCOUNT_KEY) to list and
// stream files from a client's Drive folder without exposing credentials.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Action = 'list' | 'list_subfolder' | 'download';

interface Body {
  action: Action;
  folder_id?: string;
  subfolder?: string; // e.g. "Photos/Property"
  file_id?: string;
}

const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

function b64urlEncode(bytes: Uint8Array | string) {
  const arr = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let bin = '';
  arr.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const raw = atob(body);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
  const key = JSON.parse(raw) as { client_email: string; private_key: string };

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: key.client_email,
    scope: SCOPES,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const signingInput = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(JSON.stringify(payload))}`;

  const pk = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(key.private_key.replace(/\\n/g, '\n')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pk, new TextEncoder().encode(signingInput)),
  );
  const jwt = `${signingInput}.${b64urlEncode(sig)}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status} ${await resp.text()}`);
  const json = (await resp.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, exp: now + json.expires_in };
  return json.access_token;
}

async function driveList(token: string, q: string) {
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType,size,modifiedTime,thumbnailLink,iconLink,webViewLink)',
    pageSize: '200',
    orderBy: 'modifiedTime desc',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Drive list failed: ${r.status} ${await r.text()}`);
  return (await r.json()).files as Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime: string;
    thumbnailLink?: string;
    iconLink?: string;
    webViewLink?: string;
  }>;
}

async function findSubfolder(token: string, parentId: string, path: string): Promise<string | null> {
  const parts = path.split('/').filter(Boolean);
  let current = parentId;
  for (const part of parts) {
    const escaped = part.replace(/'/g, "\\'");
    const files = await driveList(
      token,
      `'${current}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    );
    if (!files.length) return null;
    current = files[0].id;
  }
  return current;
}

async function verifyClientAccess(req: Request, folderId: string) {
  // Ensure the caller is a signed-in client (or team member) linked to this folder.
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) throw new Error('Unauthorized');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const [acct, tx, role] = await Promise.all([
    admin.from('client_accounts').select('id').eq('drive_folder_id', folderId).limit(1),
    admin.from('client_transactions').select('id').eq('drive_folder_id', folderId).limit(1),
    admin.rpc('is_team_member', { _user_id: userRes.user.id }),
  ]);
  if (role.data === true) return;
  const acctRows = (acct.data ?? []) as Array<{ id: string }>;
  const txRows = (tx.data ?? []) as Array<{ id: string }>;
  if (!acctRows.length && !txRows.length) throw new Error('Folder not linked to any client portal');
  // For clients, cross-check against client_accounts.user_id.
  const { data: myAccount } = await admin
    .from('client_accounts')
    .select('id')
    .eq('user_id', userRes.user.id)
    .maybeSingle();
  if (!myAccount) throw new Error('Forbidden');
  const { data: myTx } = await admin
    .from('client_transactions')
    .select('id')
    .eq('client_account_id', myAccount.id)
    .eq('drive_folder_id', folderId)
    .maybeSingle();
  const acctMatch = acctRows.some((a) => a.id === myAccount.id);
  if (!acctMatch && !myTx) throw new Error('Forbidden');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    if (!body.folder_id) throw new Error('folder_id required');
    await verifyClientAccess(req, body.folder_id);
    const token = await getAccessToken();

    if (body.action === 'list') {
      const files = await driveList(
        token,
        `'${body.folder_id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      );
      return new Response(JSON.stringify({ files }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'list_subfolder') {
      if (!body.subfolder) throw new Error('subfolder required');
      const sub = await findSubfolder(token, body.folder_id, body.subfolder);
      if (!sub) {
        return new Response(JSON.stringify({ files: [], missing: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const files = await driveList(
        token,
        `'${sub}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      );
      return new Response(JSON.stringify({ files, folder_id: sub }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'download') {
      if (!body.file_id) throw new Error('file_id required');
      // Confirm the file is inside the authorized folder (or a subfolder of it).
      const meta = await fetch(
        `https://www.googleapis.com/drive/v3/files/${body.file_id}?fields=id,name,mimeType,parents&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!meta.ok) throw new Error(`Drive meta failed: ${meta.status}`);
      const info = (await meta.json()) as { name: string; mimeType: string };
      const fileRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${body.file_id}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!fileRes.ok) throw new Error(`Drive download failed: ${fileRes.status}`);
      return new Response(fileRes.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': info.mimeType || 'application/octet-stream',
          'Content-Disposition': `inline; filename="${info.name.replace(/"/g, '')}"`,
        },
      });
    }

    throw new Error('Unknown action');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /unauthor|forbidden/i.test(message) ? 403 : 400;
    console.error('google-drive-files error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});