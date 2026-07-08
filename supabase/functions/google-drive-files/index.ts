// Google Drive files proxy for the client portal.
// Uses the *agent's* OAuth2 tokens (per-user), stored in
// public.agent_google_drive_tokens, so each agent grants access to their
// own Drive account. GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (already used
// for Google Calendar) are the OAuth client credentials.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Action =
  | 'get_auth_url'
  | 'exchange_code'
  | 'disconnect'
  | 'status'
  | 'list'
  | 'list_subfolder'
  | 'download';

interface Body {
  action: Action;
  folder_id?: string;
  subfolder?: string;
  file_id?: string;
  code?: string;
  redirect_uri?: string;
}

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'openid',
  'email',
].join(' ');

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function getCallerUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const c = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data } = await c.auth.getUser();
  if (!data?.user) throw new Error('Unauthorized');
  return data.user;
}

/**
 * Return a valid access token for the agent identified by `agentUserId`,
 * refreshing it via the stored refresh_token when close to expiry.
 */
async function getAgentAccessToken(agentUserId: string): Promise<string> {
  const db = admin();
  const { data: row, error } = await db
    .from('agent_google_drive_tokens')
    .select('*')
    .eq('user_id', agentUserId)
    .maybeSingle();
  if (error) throw new Error(`Token lookup failed: ${error.message}`);
  if (!row) throw new Error('Agent has not connected Google Drive yet');

  const expiresAt = new Date(row.expires_at as string).getTime();
  if (expiresAt - Date.now() > 60_000) return row.access_token as string;

  if (!row.refresh_token) throw new Error('Agent Drive token expired and no refresh token');

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: row.refresh_token as string,
      grant_type: 'refresh_token',
    }),
  });
  const json = (await resp.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!resp.ok || !json.access_token) {
    throw new Error(`Refresh failed: ${json.error ?? resp.status}`);
  }
  const newExpiry = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  await db
    .from('agent_google_drive_tokens')
    .update({ access_token: json.access_token, expires_at: newExpiry })
    .eq('user_id', agentUserId);
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

/**
 * Resolve which agent owns the client portal folder, and confirm the caller
 * (agent or the linked client) is allowed to read it. Returns the agent's
 * user_id whose OAuth token should be used for Drive.
 */
async function resolveFolderAgent(callerUserId: string, folderId: string): Promise<string> {
  const db = admin();
  const [{ data: acctRows }, { data: txRows }, roleRes] = await Promise.all([
    db
      .from('client_accounts')
      .select('id, user_id, invited_by')
      .eq('drive_folder_id', folderId),
    db
      .from('client_transactions')
      .select('id, client_account_id, agent_id')
      .eq('drive_folder_id', folderId),
    db.rpc('is_team_member', { _user_id: callerUserId }),
  ]);
  const accts = (acctRows ?? []) as Array<{ id: string; user_id: string | null; invited_by: string | null }>;
  const txs = (txRows ?? []) as Array<{ id: string; client_account_id: string; agent_id: string | null }>;
  if (!accts.length && !txs.length) throw new Error('Folder not linked to any client portal');

  // Team members may read any folder tied to a client portal.
  const isTeam = roleRes.data === true;

  // Check if caller is the client on any account linked to this folder.
  let clientMatch = accts.some((a) => a.user_id === callerUserId);
  if (!clientMatch && txs.length) {
    const { data: myAcct } = await db
      .from('client_accounts')
      .select('id')
      .eq('user_id', callerUserId)
      .maybeSingle();
    if (myAcct) clientMatch = txs.some((t) => t.client_account_id === (myAcct as { id: string }).id);
  }

  if (!isTeam && !clientMatch) throw new Error('Forbidden');

  // Pick agent to act on behalf of: transaction agent > account invited_by.
  const agentId =
    txs.find((t) => t.agent_id)?.agent_id ??
    accts.find((a) => a.invited_by)?.invited_by ??
    null;
  if (!agentId) throw new Error('This client portal has no linked agent');
  return agentId;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    const user = await getCallerUser(req);

    // --- Agent OAuth management -------------------------------------------------
    if (body.action === 'get_auth_url') {
      if (!body.redirect_uri) throw new Error('redirect_uri required');
      const authUrl =
        'https://accounts.google.com/o/oauth2/v2/auth?' +
        new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          redirect_uri: body.redirect_uri,
          response_type: 'code',
          scope: SCOPES,
          access_type: 'offline',
          prompt: 'consent',
          include_granted_scopes: 'true',
          state: user.id,
        }).toString();
      return new Response(JSON.stringify({ auth_url: authUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'exchange_code') {
      if (!body.code || !body.redirect_uri) throw new Error('code and redirect_uri required');
      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: body.code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: body.redirect_uri,
          grant_type: 'authorization_code',
        }),
      });
      const tokens = (await tokenResp.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
        error?: string;
        error_description?: string;
      };
      if (!tokenResp.ok || !tokens.access_token) {
        throw new Error(tokens.error_description || tokens.error || 'Token exchange failed');
      }
      // Look up Google email for display purposes.
      let googleEmail: string | null = null;
      try {
        const uiResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (uiResp.ok) googleEmail = (await uiResp.json()).email ?? null;
      } catch (_) {
        // ignore
      }
      const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
      const db = admin();
      // Preserve prior refresh_token when Google omits it on re-consent.
      const { data: existing } = await db
        .from('agent_google_drive_tokens')
        .select('refresh_token')
        .eq('user_id', user.id)
        .maybeSingle();
      const refresh = tokens.refresh_token ?? (existing as { refresh_token: string | null } | null)?.refresh_token ?? null;
      const { error: upErr } = await db
        .from('agent_google_drive_tokens')
        .upsert({
          user_id: user.id,
          access_token: tokens.access_token,
          refresh_token: refresh,
          expires_at: expiresAt,
          scope: tokens.scope ?? null,
          google_email: googleEmail,
        });
      if (upErr) throw new Error(`Save failed: ${upErr.message}`);
      return new Response(JSON.stringify({ ok: true, google_email: googleEmail }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'status') {
      const db = admin();
      const { data } = await db
        .from('agent_google_drive_tokens')
        .select('google_email, scope, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();
      return new Response(JSON.stringify({ connected: !!data, ...(data ?? {}) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'disconnect') {
      const db = admin();
      await db.from('agent_google_drive_tokens').delete().eq('user_id', user.id);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Drive file operations --------------------------------------------------
    if (!body.folder_id) throw new Error('folder_id required');
    const agentUserId = await resolveFolderAgent(user.id, body.folder_id);
    const token = await getAgentAccessToken(agentUserId);

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
    const status = /unauthor/i.test(message)
      ? 401
      : /forbidden/i.test(message)
        ? 403
        : 400;
    console.error('google-drive-files error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});