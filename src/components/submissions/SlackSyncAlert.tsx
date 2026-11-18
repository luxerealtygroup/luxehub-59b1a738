import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useUserRole } from '@/hooks/useUserRole';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { needsSlackRetry, SLACK_TRACKING_START } from './slackTracking';

interface Row { id:string; form_type:string; client_name:string|null; property_address:string|null; agent_name:string|null; created_at:string; slack_posted_at:string|null; slack_error:string|null }
export function SlackSyncAlert({ refresh = 0 }: { refresh?: number }) {
  const { orgId } = useTenant();
  const { isAdmin,isOperations } = useUserRole();
  const [rows,setRows] = useState<Row[]>([]);
  const [retrying,setRetrying] = useState<string|null>(null);
  const [expanded,setExpanded] = useState(false);
  const load = async () => {
    if (!orgId || (!isAdmin && !isOperations)) return;
    const [submissions,channels] = await Promise.all([
      supabase.from('submissions').select('id,form_type,client_name,property_address,agent_name,created_at,slack_posted_at,slack_error').eq('org_id',orgId).gte('created_at',SLACK_TRACKING_START).order('created_at',{ ascending:false }).limit(100),
      supabase.from('submission_slack_channels').select('form_type,channel_id').eq('org_id',orgId),
    ]);
    if (submissions.error || channels.error) return;
    const configured = new Set((channels.data || []).filter(c => c.channel_id).map(c => c.form_type));
    setRows((submissions.data || []).filter(row => needsSlackRetry(row,configured)));
  };
  useEffect(() => { void load(); },[orgId,isAdmin,isOperations,refresh]);
  const retry = async (id:string) => {
    setRetrying(id);
    try {
      const { data,error } = await supabase.functions.invoke('slack-post-submission',{ body:{ action:'post',submission_id:id } });
      if (error || data?.ok === false) toast.warning(data?.error || 'Slack post failed. Submission remains saved.');
      else if (data?.skipped) toast.info('No Slack destination configured.');
      else toast.success('Posted to Slack');
      await load();
    } catch { toast.warning('Slack post failed. Submission remains saved.'); }
    finally { setRetrying(null); }
  };
  if ((!isAdmin && !isOperations) || !rows.length) return null;
  return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle className="flex justify-between gap-2">
    <span>{rows.length} submissions need a Slack retry</span><Button variant="ghost" size="icon" title="Refresh Slack sync alert" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
    </AlertTitle><AlertDescription><p className="mb-2">Submissions remain saved in LUXEhub.</p><ul className="space-y-2">{(expanded ? rows : rows.slice(0,5)).map(row => <li key={row.id} className="flex flex-wrap items-center gap-2">
      <span>{row.client_name || row.property_address || row.form_type} {row.agent_name ? `— ${row.agent_name}` : ''}</span>
      <span>{row.slack_error || 'Not posted to Slack'}</span><Button variant="outline" size="sm" disabled={!!retrying} onClick={() => retry(row.id)}>{retrying === row.id ? 'Retrying…' : 'Retry Slack post'}</Button>
    </li>)}</ul>{rows.length > 5 && <Button variant="ghost" size="sm" onClick={() => setExpanded(v => !v)}>{expanded ? 'Show less' : 'Show all'}</Button>}</AlertDescription></Alert>;
}