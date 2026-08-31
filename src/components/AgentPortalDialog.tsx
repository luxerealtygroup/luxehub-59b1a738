import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Copy, Eye, LayoutDashboard, Loader2, Mail } from 'lucide-react';
import { FUBTimeline } from '@/pages/client-portal/components/FUBTimeline';
import { ClientTaskList } from '@/pages/client-portal/components/ClientTaskList';
import { FUBContactTypeahead } from '@/components/FUBContactTypeahead';
import { SlackChannelPicker } from '@/components/SlackChannelPicker';
import { PortalDocumentsPanel } from '@/components/portal/PortalDocumentsPanel';
import { PortalPhotosPanel } from '@/components/portal/PortalPhotosPanel';
import { PortalChatPanel } from '@/components/portal/PortalChatPanel';
import { useUserRole } from '@/hooks/useUserRole';
import { useOrgTier } from '@/hooks/useOrgTier';
import { Link } from 'react-router-dom';

interface AgentPortalDialogProps {
  clientName?: string;
  clientEmail?: string;
  fubPersonId?: number | null;
  defaultType?: 'buyer' | 'seller';
  trigger?: React.ReactNode;
  initialTab?: 'setup' | 'timeline' | 'tasks' | 'documents' | 'photos' | 'messages';
}

interface ClientAccountRow {
  id: string;
  email: string;
  full_name: string | null;
  fub_person_id: number | null;
  client_type: string | null;
  drive_folder_id: string | null;
  slack_channel_id: string | null;
  invited_by: string | null;
}

export function AgentPortalDialog({
  clientName,
  clientEmail,
  fubPersonId,
  defaultType,
  trigger,
  initialTab,
}: AgentPortalDialogProps) {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { canAccessCRMConnections } = useOrgTier();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<ClientAccountRow | null>(null);
  const [form, setForm] = useState({
    full_name: clientName || '',
    email: clientEmail || '',
    client_type: (defaultType as 'buyer' | 'seller' | undefined) ?? 'buyer',
    fub_person_id: fubPersonId ? String(fubPersonId) : '',
    drive_folder_id: '',
    slack_channel_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [agents, setAgents] = useState<{ id: string; full_name: string | null }[]>([]);
  const [assignedAgentId, setAssignedAgentId] = useState<string>('');

  const lookupKey = useMemo(
    () => (form.email || clientEmail || '').trim().toLowerCase(),
    [form.email, clientEmail],
  );

  useEffect(() => {
    if (!open) return;
    const run = async () => {
      setLoading(true);
      let query = supabase.from('client_accounts').select('*').limit(1);
      if (lookupKey) query = query.eq('email', lookupKey);
      else if (fubPersonId) query = query.eq('fub_person_id', fubPersonId);
      const { data } = await query.maybeSingle();
      setAccount((data as ClientAccountRow) ?? null);
      setAssignedAgentId((data as ClientAccountRow)?.invited_by || user?.id || '');
      if (data) {
        setForm((f) => ({
          ...f,
          full_name: data.full_name || f.full_name,
          email: data.email || f.email,
          client_type: (data.client_type as 'buyer' | 'seller') || f.client_type,
          fub_person_id: data.fub_person_id ? String(data.fub_person_id) : f.fub_person_id,
          drive_folder_id: data.drive_folder_id || '',
          slack_channel_id: data.slack_channel_id || '',
        }));
      }
      setLoading(false);
    };
    run();
  }, [open, lookupKey, fubPersonId, user?.id]);

  // Admins can reassign a portal to another agent.
  useEffect(() => {
    if (!open || !isAdmin) return;
    supabase.rpc('get_team_agents').then(({ data }) => {
      setAgents(
        ((data as any[]) ?? [])
          .map((a) => ({ id: a.id as string, full_name: (a.full_name as string) ?? a.email }))
          .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')),
      );
    });
  }, [open, isAdmin]);

  const saveAccount = async (): Promise<ClientAccountRow | null> => {
    if (!user) return null;
    if (!form.email.trim()) {
      toast({ title: 'Email required', variant: 'destructive' });
      return null;
    }
    setSaving(true);
    const payload = {
      email: form.email.trim().toLowerCase(),
      full_name: form.full_name.trim() || null,
      client_type: form.client_type,
      fub_person_id: form.fub_person_id ? Number(form.fub_person_id) : null,
      drive_folder_id: form.drive_folder_id.trim() || null,
      slack_channel_id: form.slack_channel_id.trim() || null,
      // Never silently steal ownership: keep the existing agent unless an admin
      // explicitly reassigns the portal.
      invited_by: assignedAgentId || account?.invited_by || user.id,
    };
    let saved: ClientAccountRow | null = null;
    if (account) {
      const { data, error } = await supabase
        .from('client_accounts')
        .update(payload)
        .eq('id', account.id)
        .select()
        .single();
      if (error) {
        toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      } else {
        saved = data as ClientAccountRow;
      }
    } else {
      // Brand-new invitee: no auth.users row yet, so the portal is created
      // pending (user_id NULL) and gets linked when the client signs up.
      const { data, error } = await supabase
        .from('client_accounts')
        .insert({ ...payload, user_id: null })
        .select()
        .single();

      if (error) {
        toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      } else {
        saved = data as ClientAccountRow;
      }
    }
    setSaving(false);
    if (saved) {
      setAccount(saved);
      setForm((f) => ({ ...f, slack_channel_id: saved!.slack_channel_id || '' }));
      toast({
        title: 'Portal saved',
        description: saved.slack_channel_id ? 'Slack channel linked.' : 'Changes saved.',
      });
    }
    return saved;
  };



  const handleCopyLink = async () => {
    const saved = account ?? (await saveAccount());
    if (!saved) return;
    setSendingInvite(true);
    try {
      // Copying a link issues a real single-use token, same as emailing it.
      const invite = await createPortalInvite(saved.id);
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      toast({
        title: 'Invite link copied',
        description: 'Single-use link, valid for 7 days.',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: 'Could not create invite link',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSendingInvite(false);
    }
  };

  const sendSignupEmail = async () => {
    const saved = account ?? (await saveAccount());
    if (!saved) return;
    setSendingInvite(true);
    try {
      await sendPortalInvite({
        portalId: saved.id,
        email: saved.email,
        clientName: saved.full_name,
        agentName: user?.email?.split('@')[0] || 'Your agent',
      });
      toast({
        title: 'Invitation sent',
        description: `${saved.email} will receive a single-use portal link, valid for 7 days.`,
      });
    } catch (err) {
      toast({
        title: 'Send failed',
        description: err instanceof Error ? err.message : 'Could not send the invitation.',
        variant: 'destructive',
      });
    } finally {
      setSendingInvite(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Client Portal
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.full_name || 'Client'} — Portal</DialogTitle>
          <DialogDescription>
            Invite this client to their portal, add stage notes, and manage tasks.
          </DialogDescription>
          {account && (
            <div className="pt-1">
              <Button asChild size="sm" variant="outline" className="gap-2">
                <Link to={`/client-portal/preview/${account.id}`}>
                  <Eye className="h-4 w-4" />
                  Preview as client (read-only)
                </Link>
              </Button>
            </div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading portal…
          </div>
        ) : (
          <Tabs defaultValue={initialTab ?? (account ? 'timeline' : 'setup')} className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="setup">Setup</TabsTrigger>
              <TabsTrigger value="timeline" disabled={!account}>
                Timeline
              </TabsTrigger>
              <TabsTrigger value="tasks" disabled={!account}>
                Tasks
              </TabsTrigger>
              <TabsTrigger value="documents" disabled={!account}>
                Documents
              </TabsTrigger>
              <TabsTrigger value="photos" disabled={!account}>
                Photos
              </TabsTrigger>
              <TabsTrigger value="messages" disabled={!account}>
                Messages
              </TabsTrigger>
            </TabsList>

            <TabsContent value="setup" className="space-y-3 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Client name</Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Client type</Label>
                  <Select value={form.client_type} onValueChange={(v) => setForm({ ...form, client_type: v as 'buyer' | 'seller' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buyer">Buyer</SelectItem>
                      <SelectItem value="seller">Seller</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>FUB contact</Label>
                  <FUBContactTypeahead
                    selectedContact={
                      form.fub_person_id
                        ? {
                            id: Number(form.fub_person_id),
                            name: form.full_name || `FUB #${form.fub_person_id}`,
                            email: form.email || undefined,
                          }
                        : null
                    }
                    onSelect={(c) =>
                      setForm({
                        ...form,
                        fub_person_id: String(c.id),
                        full_name: form.full_name || c.name,
                        email: form.email || c.email || '',
                      })
                    }
                    onClear={() => setForm({ ...form, fub_person_id: '' })}
                  />
                </div>
                {isAdmin && (
                  <div className="space-y-1">
                    <Label>Assigned agent</Label>
                    <Select value={assignedAgentId} onValueChange={setAssignedAgentId}>
                      <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                      <SelectContent>
                        {agents.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.full_name || 'Unnamed'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Controls who owns this portal and receives client messages.
                    </p>
                  </div>
                )}
                <div className="space-y-1">
                  {canAccessCRMConnections && (
                    <>
                      <Label>Slack channel</Label>
                      <SlackChannelPicker
                        value={form.slack_channel_id}
                        onChange={(id) => setForm({ ...form, slack_channel_id: id })}
                      />
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={saveAccount} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {account ? 'Save changes' : 'Create portal'}
                </Button>
                <Button variant="outline" onClick={handleCopyLink} disabled={!form.email.trim()}>
                  {copied ? <Check className="h-4 w-4 mr-2 text-green-500" /> : <Copy className="h-4 w-4 mr-2" />}
                  Copy invite link
                </Button>
                <Button variant="secondary" onClick={sendSignupEmail} disabled={sendingInvite || !form.email.trim()}>
                  {sendingInvite ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                  Send signup email
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="pt-4">
              {account && (
                <FUBTimeline
                  clientAccountId={account.id}
                  fubPersonId={account.fub_person_id}
                  canAddNotes
                />
              )}
            </TabsContent>

            <TabsContent value="tasks" className="pt-4">
              {account && <ClientTaskList clientAccountId={account.id} canManage />}
            </TabsContent>

            <TabsContent value="documents" className="pt-4">
              {account && <PortalDocumentsPanel portalId={account.id} canManage={isAdmin} />}
            </TabsContent>

            <TabsContent value="photos" className="pt-4">
              {account && <PortalPhotosPanel portalId={account.id} canManage={isAdmin} />}
            </TabsContent>

            <TabsContent value="messages" className="pt-4">
              {account && (
                <PortalChatPanel
                  portalId={account.id}
                  viewerRole="agent"
                  sendAsAgentId={account.invited_by ?? null}
                />
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}