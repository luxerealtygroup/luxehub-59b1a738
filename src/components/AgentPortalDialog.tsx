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
import { LayoutDashboard, Loader2, Mail, Send } from 'lucide-react';
import { FUBTimeline } from '@/pages/client-portal/components/FUBTimeline';
import { ClientTaskList } from '@/pages/client-portal/components/ClientTaskList';

interface AgentPortalDialogProps {
  clientName?: string;
  clientEmail?: string;
  fubPersonId?: number | null;
  defaultType?: 'buyer' | 'seller';
}

interface ClientAccountRow {
  id: string;
  email: string;
  full_name: string | null;
  fub_person_id: number | null;
  client_type: string | null;
  drive_folder_id: string | null;
  slack_channel_id: string | null;
}

export function AgentPortalDialog({
  clientName,
  clientEmail,
  fubPersonId,
  defaultType,
}: AgentPortalDialogProps) {
  const { user } = useAuth();
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
  }, [open, lookupKey, fubPersonId]);

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
      invited_by: user.id,
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
      // For a brand-new invitee we don't yet have an auth.users row, so the
      // account is upserted after they accept the magic link. We store a
      // provisional row keyed to the inviting agent so notes/tasks can attach
      // right away; user_id gets patched by handle_new_user when they sign up.
      const { data, error } = await supabase
        .from('client_accounts')
        .insert({ ...payload, user_id: user.id })
        .select()
        .single();
      if (error) {
        toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      } else {
        saved = data as ClientAccountRow;
      }
    }
    setSaving(false);
    if (saved) setAccount(saved);
    return saved;
  };

  const sendMagicLink = async () => {
    const saved = account ?? (await saveAccount());
    if (!saved) return;
    setSendingInvite(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: saved.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/client-portal`,
        data: { full_name: saved.full_name ?? undefined },
      },
    });
    setSendingInvite(false);
    if (error) {
      toast({ title: 'Magic link failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Invitation sent',
      description: `${saved.email} will receive a magic link to sign in to their portal.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <LayoutDashboard className="h-4 w-4" />
          Client Portal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.full_name || 'Client'} — Portal</DialogTitle>
          <DialogDescription>
            Invite this client to their portal, add stage notes, and manage tasks.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading portal…
          </div>
        ) : (
          <Tabs defaultValue={account ? 'timeline' : 'setup'} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="setup">Setup</TabsTrigger>
              <TabsTrigger value="timeline" disabled={!account}>
                Timeline
              </TabsTrigger>
              <TabsTrigger value="tasks" disabled={!account}>
                Tasks
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
                  <Label>FUB contact ID</Label>
                  <Input value={form.fub_person_id} onChange={(e) => setForm({ ...form, fub_person_id: e.target.value.replace(/[^0-9]/g, '') })} placeholder="e.g. 12345" />
                </div>
                <div className="space-y-1">
                  <Label>Drive folder ID</Label>
                  <Input value={form.drive_folder_id} onChange={(e) => setForm({ ...form, drive_folder_id: e.target.value })} placeholder="Google Drive folder ID" />
                </div>
                <div className="space-y-1">
                  <Label>Slack channel ID</Label>
                  <Input value={form.slack_channel_id} onChange={(e) => setForm({ ...form, slack_channel_id: e.target.value })} placeholder="C0123456" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={saveAccount} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {account ? 'Save changes' : 'Create portal'}
                </Button>
                <Button variant="secondary" onClick={sendMagicLink} disabled={sendingInvite || !form.email.trim()}>
                  {sendingInvite ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Send magic-link invitation
                </Button>
                {account && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      supabase.auth
                        .resetPasswordForEmail(account.email, {
                          redirectTo: `${window.location.origin}/reset-password`,
                        })
                        .then(() => toast({ title: 'Signup / reset email sent', description: `Sent to ${account.email}` }))
                    }
                  >
                    <Mail className="h-4 w-4 mr-2" /> Send signup link
                  </Button>
                )}
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
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}