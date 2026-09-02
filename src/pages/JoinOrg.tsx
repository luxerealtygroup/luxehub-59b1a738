/**
 * Invitation acceptance for team seats (/join?token=...).
 * Works for a brand new person (sign up) and for someone already signed in.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import TenantLogo from '@/components/TenantLogo';

type Status = 'loading' | 'valid' | 'invalid' | 'used' | 'expired';

interface InviteInfo {
  status: string;
  org_id: string | null;
  org_name: string | null;
  email: string | null;
  full_name: string | null;
  role: string | null;
}

const JoinOrg = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>('loading');
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [currentOrgName, setCurrentOrgName] = useState<string | null>(null);
  const [confirmMove, setConfirmMove] = useState(false);

  useEffect(() => {
    const run = async () => {
      const { data: sess } = await supabase.auth.getSession();
      const session = sess.session;
      setSignedIn(Boolean(session));
      setCurrentEmail(session?.user.email ?? null);

      if (session) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('org_id, organizations(name)')
          .eq('id', session.user.id)
          .maybeSingle();
        setCurrentOrgId(prof?.org_id ?? null);
        setCurrentOrgName(
          (prof?.organizations as { name: string } | null)?.name ?? null,
        );
      }

      const { data, error } = await supabase.rpc('validate_org_invite', { _token: token });
      const row = (Array.isArray(data) ? data[0] : data) as InviteInfo | undefined;
      if (error || !row || row.status === 'invalid') return setStatus('invalid');
      setInfo(row);
      setStatus(row.status === 'valid' ? 'valid' : (row.status as Status));
    };
    if (!token) setStatus('invalid');
    else void run();
  }, [token]);

  // A signed-in session that already belongs to a DIFFERENT team would be moved
  // out of that team by accepting. Never let that happen silently.
  const wouldMoveAccount =
    signedIn &&
    Boolean(currentOrgId) &&
    Boolean(info?.org_id) &&
    currentOrgId !== info?.org_id;

  const signOutAndRestart = async () => {
    await supabase.auth.signOut();
    window.location.href = `/join?token=${encodeURIComponent(token)}`;
  };

  const accept = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (wouldMoveAccount && !confirmMove) {
      toast.error('Tick the confirmation box first — this moves your account between teams.');
      return;
    }
    const fd = new FormData(e.currentTarget);
    const fullName = String(fd.get('fullName') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    const confirm = String(fd.get('confirmPassword') ?? '');

    setSubmitting(true);
    try {
      if (!signedIn) {
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        if (password !== confirm) throw new Error('The passwords do not match.');
        const { error } = await supabase.auth.signUp({
          email: info?.email ?? '',
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/join?token=${token}`,
            data: { full_name: fullName },
          },
        });
        if (error) throw new Error(error.message);
      }

      const { error: claimErr } = await supabase.rpc('claim_org_invite', {
        _token: token,
        _full_name: fullName || null,
      });
      if (claimErr) throw new Error(claimErr.message);

      toast.success(`Welcome to ${info?.org_name ?? 'the team'}.`);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not accept the invitation.');
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <TenantLogo height={36} />
          <CardTitle>
            {status === 'valid' ? `Join ${info?.org_name ?? 'the team'}` : 'Invitation'}
          </CardTitle>
          <CardDescription>
            {status === 'loading' && 'Checking your invitation…'}
            {status === 'valid' && 'Set up your account to get started.'}
            {status === 'used' && 'This invitation has already been used.'}
            {status === 'expired' && 'This invitation has expired — ask for a new one.'}
            {status === 'invalid' && 'This invitation link is not valid.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'loading' && <Loader2 className="h-5 w-5 animate-spin" />}
          {status === 'valid' && (
            <form onSubmit={accept} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={info?.email ?? ''} readOnly disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  defaultValue={info?.full_name ?? ''}
                  autoComplete="name"
                  required
                />
              </div>
              {!signedIn && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="password">Create a password</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm password</Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Accept invitation
              </Button>
            </form>
          )}
          {(status === 'used' || status === 'expired' || status === 'invalid') && (
            <Button variant="outline" className="w-full" onClick={() => navigate('/login')}>
              Go to sign in
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinOrg;
