import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useTenant } from '@/hooks/useTenant';
import { SlackChannelPicker } from '@/components/SlackChannelPicker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Settings, X } from 'lucide-react';
import { toast } from 'sonner';

const types = { open_house:'Open House', listing:'Listing', buyer:'Buyer', invoice:'Invoice' };
export function SlackDestinations({ onSaved }: { onSaved: () => void }) {
  const { isAdmin, isOperations } = useUserRole();
  const { orgId } = useTenant();
  const [open,setOpen] = useState(false);
  const [values,setValues] = useState<Record<string,string>>({});
  const [loading,setLoading] = useState(false);
  useEffect(() => {
    if (!open || !orgId || (!isAdmin && !isOperations)) return;
    let cancelled = false;
    setLoading(true);
    supabase.from('submission_slack_channels').select('*').eq('org_id',orgId).then(({ data,error }) => {
      if (cancelled) return;
      if (error) { toast.error('Could not load Slack destinations'); setOpen(false); }
      else setValues(Object.fromEntries((data || []).map(row => [row.form_type,row.channel_id || ''])));
      setLoading(false);
    });
    return () => { cancelled = true; };
  },[open,orgId,isAdmin,isOperations]);
  if (!isAdmin && !isOperations) return null;
  const save = async () => {
    if (!orgId || loading) return;
    setLoading(true);
    const { data: directory } = await supabase.functions.invoke('slack-list-channels');
    const channels = (directory?.channels || []) as { id:string; name:string }[];
    const { error } = await supabase.from('submission_slack_channels').upsert(Object.keys(types).map(form_type => ({ org_id:orgId,form_type,channel_id:values[form_type] || null,channel_name:channels.find(channel => channel.id === values[form_type])?.name || null,updated_at:new Date().toISOString() })), { onConflict:'org_id,form_type' });
    setLoading(false);
    if (error) { toast.error('Could not save Slack destinations'); return; }
    toast.success('Slack destinations saved'); setOpen(false); onSaved();
  };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm" variant="outline"><Settings className="mr-2 h-4 w-4" />Slack destinations</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>Slack destinations</DialogTitle></DialogHeader>
      {loading ? <p className="text-muted-foreground">Loading…</p> : Object.entries(types).map(([key,label]) => <div key={key} className="space-y-2"><Label>{label}</Label><div className="flex gap-2">
        <SlackChannelPicker value={values[key] || ''} onChange={value => setValues(prev => ({ ...prev,[key]:value }))} />
        <Button variant="ghost" size="icon" title={`Clear ${label} destination`} onClick={() => setValues(prev => ({ ...prev,[key]:'' }))}><X className="h-4 w-4" /></Button>
      </div></div>)}
      <Button onClick={save} disabled={loading}>Save destinations</Button>
    </DialogContent></Dialog>;
}