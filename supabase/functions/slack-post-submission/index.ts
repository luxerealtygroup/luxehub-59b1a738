import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { requireStaff } from '../_shared/auth.ts';
import { getSlackToken, SLACK_API } from '../_shared/slack.ts';
import { buildMessage, collectFiles } from './message.ts';

const schema = z.object({ action: z.enum(['post','status']).default('post'), submission_id: z.string().uuid().optional() }).refine(body => body.action === 'status' || !!body.submission_id, { message: 'submission_id is required for post' });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const slackError = (code: string) => ({
  not_in_channel: 'Invite the Slack bot to the destination channel.', channel_not_found: 'The Slack destination channel was not found.',
  missing_scope: 'The Slack bot needs additional permissions.', invalid_auth: 'Slack rejected the configured bot token.',
  token_revoked: 'The Slack bot token has been revoked.',
}[code] || `Slack request failed (${code.slice(0,100)}).`);

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const gate = await requireStaff(req, { cors: corsHeaders });
  if (!gate.ok) return gate.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues.map(i => i.message).join('; ') },400);
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  // Service callers cannot choose an arbitrary brokerage through this endpoint.
  if (!gate.caller.userId) return json({ error: 'A signed-in staff account is required.' },403);
  const { data: profile, error: profileError } = await admin.from('profiles').select('org_id').eq('id',gate.caller.userId).single();
  if (profileError || !profile?.org_id) return json({ error: 'Could not determine your brokerage.' },403);
  const orgId = profile.org_id;
  const { data: channels, error: channelError } = await admin.from('submission_slack_channels').select('*').eq('org_id',orgId);
  if (channelError) return json({ ok:false, error:'Could not load Slack destinations.' });
  let token: string | null = null;
  try { token = await getSlackToken(); } catch { /* handled below without exposing credentials */ }
  const slack = async (method: string, body: Record<string, unknown> = {}, form = false) => {
    if (!token) throw new Error('Slack is not configured. Ask the owner to connect Slack.');
    const response = await fetch(`${SLACK_API}/${method}`, { method:'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form ? new URLSearchParams(Object.entries(body).map(([key,value]) => [key,String(value)])) : JSON.stringify(body) });
    const data = await response.json().catch(() => ({ ok:false,error:'invalid_response' }));
    if (!response.ok || !data.ok) throw new Error(slackError(String(data.error || response.status)));
    return { data, scopes: (response.headers.get('x-oauth-scopes') || '').split(',').map(s => s.trim()).filter(Boolean) };
  };
  if (parsed.data.action === 'status') {
    const result = { token_configured: !!token, bot_name: null as string|null, bot_user_id: null as string|null, team: null as string|null, scopes: [] as string[], error: null as string|null,
      channels: (channels || []).map(c => ({ form_type:c.form_type, channel_id:c.channel_id, channel_name:c.channel_name, bot_is_member:null as boolean|null, error:null as string|null })) };
    if (!token) { result.error = 'Slack is not configured.'; return json(result); }
    try {
      const auth = await slack('auth.test');
      result.bot_name = auth.data.user; result.bot_user_id = auth.data.user_id; result.team = auth.data.team; result.scopes = auth.scopes;
      for (const channel of result.channels) {
        if (!channel.channel_id) continue;
        try {
          const info = await slack('conversations.info', { channel:channel.channel_id },true);
          channel.channel_name = info.data.channel?.name || channel.channel_name;
          if (typeof info.data.channel?.is_member === 'boolean') channel.bot_is_member = info.data.channel.is_member;
          else {
            let cursor = ''; let member = false;
            do {
              const members = await slack('conversations.members', { channel:channel.channel_id, limit:200, cursor },true);
              member = (members.data.members || []).includes(result.bot_user_id);
              cursor = members.data.response_metadata?.next_cursor || '';
            } while (cursor && !member);
            channel.bot_is_member = member;
          }
        } catch (e) { channel.error = e instanceof Error ? e.message : 'Could not check membership.'; }
      }
    } catch (e) { result.error = e instanceof Error ? e.message : 'Slack status unavailable.'; }
    return json(result);
  }
  const { data: row, error: rowError } = await admin.from('submissions').select('*').eq('id',parsed.data.submission_id).eq('org_id',orgId).single();
  if (rowError || !row) return json({ error:'Submission not found in your brokerage.' },404);
  const destination = (channels || []).find(c => c.form_type === row.form_type);
  if (!destination?.channel_id) return json({ skipped:true, reason:'no_channel_configured' });
  if (row.slack_posted_at && !row.slack_error) return json({ ok:true, already_posted:true });
  const save = async (values: Record<string, unknown>) => {
    const { error } = await admin.from('submissions').update(values).eq('id',row.id).eq('org_id',orgId);
    return !error;
  };
  let ts = row.slack_ts; let channelId = row.slack_channel_id || destination.channel_id;
  try {
    if (!ts) {
      const posted = await slack('chat.postMessage', { channel:destination.channel_id, ...buildMessage(row), unfurl_links:false, unfurl_media:false });
      ts = posted.data.ts; channelId = posted.data.channel || destination.channel_id;
      if (!ts) throw new Error('Slack did not confirm the posted message.');
      if (!await save({ slack_ts:ts, slack_channel_id:channelId })) return json({ ok:false,error:'Posted to Slack, but delivery tracking could not be saved. Contact the office before retrying.' });
    }
    let uploaded = 0;
    const failures: string[] = []; const links: string[] = [];
    for (const file of collectFiles(row)) {
      try {
        const { data: blob, error } = await admin.storage.from('client-documents').download(file.path);
        if (error || !blob) throw new Error('The saved file could not be downloaded.');
        const upload = await slack('files.getUploadURLExternal', { filename:file.name, length:blob.size },true);
        const uploadUrl = new URL(upload.data.upload_url);
        if (uploadUrl.protocol !== 'https:' || uploadUrl.hostname !== 'files.slack.com') throw new Error('Slack returned an invalid upload destination.');
        const response = await fetch(uploadUrl, { method:'POST', body:blob });
        if (!response.ok) throw new Error(`Slack file transfer failed (${response.status}).`);
        await slack('files.completeUploadExternal', { files:[{ id:upload.data.file_id, title:file.name }], channel_id:channelId, thread_ts:ts });
        uploaded++;
      } catch (e) {
        failures.push(`${file.name}: ${e instanceof Error ? e.message : 'File upload failed.'}`);
        const { data: signed, error } = await admin.storage.from('client-documents').createSignedUrl(file.path,7*24*60*60);
        if (!error && signed?.signedUrl) links.push(`${file.name}: ${signed.signedUrl}`);
        else failures.push(`${file.name}: Could not create a temporary download link.`);
      }
    }
    if (links.length) {
      try {
        for (const link of links) await slack('chat.postMessage', { channel:channelId, thread_ts:ts, text:`File download (expires in 7 days)\n${link}`, unfurl_links:false, unfurl_media:false });
      } catch (e) { failures.push(e instanceof Error ? e.message : 'File links could not be posted.'); }
    }
    const error = failures.length ? failures.join(' ').slice(0,2000) : null;
    const saved = await save({ slack_ts:ts, slack_channel_id:channelId, slack_posted_at:new Date().toISOString(), slack_files_uploaded:uploaded, slack_error:error });
    return json({ ok:saved && !error, files_uploaded:uploaded, error:error || (!saved ? 'Slack delivery tracking could not be saved.' : null) });
  } catch (e) {
    // Only sanitized, human-readable failures are persisted, never raw HTTP bodies or tokens.
    const error = e instanceof Error ? e.message : 'Slack post failed. Please ask the office to retry.';
    await save({ slack_error:error.slice(0,2000) });
    return json({ ok:false,error });
  }
});