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

const TeamSeats = () => {
  const tenant = useTenant();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [members, setMembers] = useState<{ id: string; full_name: string | null }[]>([]);
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
      supabase.from('profiles').select('id, full_name'),
      tenant.orgId
        ? supabase.from('organizations').select('seat_limit').eq('id', tenant.orgId).maybeSingle()
        : Promise.resolve({ data: null } as { data: { seat_limit: number | null } | null }),
    ]);
    setInvites((inv.data as Invite[]) ?? []);
    setMembers(mem.data ?? []);
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

  const pending = invites.filter((i) => !i.used_at && !i.revoked_at);

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
              ? `${members.length + pending.length} of ${seatLimit} seats used.`
              : `${members.length} people on the team.`}
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
                  {i.email} · expires {new Date(i.expires_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
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
