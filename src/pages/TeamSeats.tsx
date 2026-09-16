/**
 * Owner/admin screen for a team: invite additional agents into your own
 * organization. Each invited agent sees only their own pipeline and goals.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Copy, Loader2, UserPlus, X } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';

interface Invite {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

interface Member {
  id: string;
  full_name: string | null;
  email: string | null;
  member_type: string;
  include_in_team_coaching: boolean;
  access_expires_at: string | null;
}

/** What each kind of team member is counted in. */
const MEMBER_TYPES: { value: string; label: string; blurb: string }[] = [
  { value: 'agent', label: 'Agent', blurb: 'Counted in production, coaching and the weekly sync' },
  { value: 'operations', label: 'Operations', blurb: 'Full transactions access, never counted as an agent' },
  { value: 'client', label: 'Client', blurb: 'Client portal only' },
  { value: 'demo', label: 'Demo', blurb: 'Example account for walkthroughs' },
  { value: 'system', label: 'System', blurb: 'Service or test account' },
];

const TeamSeats = () => {
  const tenant = useTenant();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [seatLimit, setSeatLimit] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'agent' | 'admin'>('agent');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [inv, mem, org] = await Promise.all([
      supabase
        .from('org_invites')
        .select('id, email, full_name, role, expires_at, used_at, revoked_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, full_name, email, member_type, include_in_team_coaching, access_expires_at')
        .order('full_name', { ascending: true }),
      tenant.orgId
        ? supabase.from('organizations').select('seat_limit').eq('id', tenant.orgId).maybeSingle()
        : Promise.resolve({ data: null } as { data: { seat_limit: number | null } | null }),
    ]);
    setInvites((inv.data as Invite[]) ?? []);
    setMembers((mem.data as Member[]) ?? []);
    setSeatLimit(org.data?.seat_limit ?? null);
    setLoading(false);
  }, [tenant.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async () => {
    if (!email.trim()) return toast.error('Enter an email address.');
    setBusy(true);
    const { data, error } = await supabase.rpc('create_org_invite', {
      _email: email.trim(),
      _role: role,
      _full_name: name.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    const token = Array.isArray(data) ? data[0]?.token : (data as { token?: string })?.token;
    if (token) setLink(`${window.location.origin}/join?token=${token}`);
    setEmail('');
    setName('');
    toast.success('Invitation created — send them the link.');
    void load();
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.rpc('revoke_org_invite', { _invite_id: id });
    if (error) return toast.error(error.message);
    toast.success('Invitation revoked.');
    void load();
  };

  const changeType = async (id: string, memberType: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({
        member_type: memberType,
        // Only agents belong in weekly coaching.
        ...(memberType === 'agent' ? {} : { include_in_team_coaching: false }),
      })
      .eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Role updated.');
    void load();
  };

  const toggleCoaching = async (id: string, include: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ include_in_team_coaching: include })
      .eq('id', id);
    if (error) return toast.error(error.message);
    void load();
  };

  const removeMember = async (m: Member) => {
    if (!window.confirm(`Remove ${m.full_name || m.email} from the team? They lose access immediately.`)) return;
    const { error } = await supabase
      .from('profiles')
      .update({
        access_expires_at: new Date().toISOString(),
        member_type: 'system',
        include_in_team_coaching: false,
      })
      .eq('id', m.id);
    if (error) return toast.error(error.message);
    toast.success('Removed from the team.');
    void load();
  };

  const pending = invites.filter((i) => !i.used_at && !i.revoked_at);
  const activeMembers = members.filter(
    (m) => !m.access_expires_at || new Date(m.access_expires_at) > new Date(),
  );
  const agentCount = activeMembers.filter((m) => m.member_type === 'agent').length;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Team</h1>
        <p className="text-muted-foreground">
          Invite agents to {tenant.brokerageName}. Each one sees only their own clients, pipeline
          and goals.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Invite an agent
          </CardTitle>
          <CardDescription>
            {seatLimit
              ? `${activeMembers.length + pending.length} of ${seatLimit} seats used · ${agentCount} agents.`
              : `${activeMembers.length} people on the team · ${agentCount} agents.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Name (optional)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Access</Label>
              <Select value={role} onValueChange={(v) => setRole(v as 'agent' | 'admin')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={invite} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create invitation
          </Button>
          {link && (
            <div className="flex items-center gap-2 rounded-md bg-muted p-2 text-xs">
              <span className="truncate">{link}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(link);
                  toast.success('Link copied.');
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>People on the team</CardTitle>
          <CardDescription>
            Only people set to Agent are counted as agents, appear in Weekly Coaching and get a
            Follow Up Boss sync each Sunday.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {!loading && activeMembers.length === 0 && (
            <p className="text-sm text-muted-foreground">Nobody on the team yet.</p>
          )}
          {activeMembers.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{m.full_name || m.email || 'Unnamed'}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.email || 'No email on file'}
                  {m.member_type === 'agent' && !m.include_in_team_coaching
                    ? ' · not in Weekly Coaching'
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {m.member_type === 'agent' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleCoaching(m.id, !m.include_in_team_coaching)}
                  >
                    {m.include_in_team_coaching ? 'Hide from coaching' : 'Add to coaching'}
                  </Button>
                )}
                <Select value={m.member_type} onValueChange={(v) => changeType(m.id, v)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" onClick={() => removeMember(m)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {!loading && pending.length === 0 && (
            <p className="text-sm text-muted-foreground">No pending invitations.</p>
          )}
          {pending.map((i) => (
            <div key={i.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{i.full_name || i.email}</p>
                <p className="text-xs text-muted-foreground">
                  {i.email} ·{' '}
                  {new Date(i.expires_at) < new Date()
                    ? `expired ${new Date(i.expires_at).toLocaleDateString()}`
                    : `expires ${new Date(i.expires_at).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {new Date(i.expires_at) < new Date() && (
                  <Badge variant="destructive">Expired</Badge>
                )}
                <Badge variant="outline">{i.role}</Badge>
                <Button size="sm" variant="ghost" onClick={() => revoke(i.id)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamSeats;
