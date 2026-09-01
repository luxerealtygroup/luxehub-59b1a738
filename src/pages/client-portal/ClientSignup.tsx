import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Building2, Loader2, Clock, ShieldAlert } from 'lucide-react';
import {
  clientFacingBaseUrl,
  rememberPendingInvite,
  clearPendingInvite,
} from '@/lib/inviteLinks';
import { tenant } from '@/config/tenant';

type InviteStatus = 'checking' | 'valid' | 'expired' | 'used' | 'invalid';

// Defined at module scope on purpose: declaring this inside the component would
// create a new component type on every render, remounting the form and dropping
// focus after each keystroke.
const Shell = ({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) => (
  <div className="min-h-screen flex items-center justify-center bg-background px-4">
    <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          {icon}
        </div>
        <CardTitle className="text-3xl font-display text-primary">{title}</CardTitle>
        <CardDescription className="text-muted-foreground">{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  </div>
);

const ClientSignup = () => {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>('checking');
  // Set when the invited email already has an account — we switch the form to
  // sign-in and still link the portal once they authenticate.
  const [existingAccount, setExistingAccount] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const token = searchParams.get('token');

  // Validate the invite token before showing the form. Portals can only be
  // claimed with a valid, unused, unexpired token — a forwarded URL is useless.
  useEffect(() => {
    const run = async () => {
      if (!token) {
        setInviteStatus('invalid');
        return;
      }
      const { data, error } = await supabase.rpc('validate_portal_invite', { _token: token });
      const row = (Array.isArray(data) ? data[0] : data) as
        | { status: string; email: string | null; full_name: string | null }
        | null;

      if (error || !row) {
        setInviteStatus('invalid');
        return;
      }
      if (row.email) setEmail(row.email);
      if (row.full_name) setFullName(row.full_name);
      setInviteStatus((row.status as InviteStatus) ?? 'invalid');
      if (row.status === 'valid') rememberPendingInvite(token);
      else clearPendingInvite();
    };
    run();
  }, [token]);

  const claimPortal = async (name?: string) => {
    const { error } = await supabase.rpc('claim_portal_invite', {
      _token: token,
      _full_name: name ?? fullName ?? null,
    });
    if (error) throw new Error(error.message);
    clearPendingInvite();
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const password = new FormData(e.currentTarget as HTMLFormElement).get('password');

    try {
      if (typeof password !== 'string') throw new Error('Please enter a password.');
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${clientFacingBaseUrl()}/auth/confirm`,
        },
      });

      if (authError) throw authError;

      // Supabase returns a user with no identities when the email is taken.
      if (!authData.user || authData.user.identities?.length === 0) {
        setExistingAccount(true);
        toast({
          title: 'You already have an account',
          description: 'Sign in below and we\u2019ll connect you to your portal.',
        });
        return;
      }

      // Session present = email confirmation is off, so claim immediately.
      if (authData.session) {
        await claimPortal(fullName);
        navigate('/client-portal');
        return;
      }

      // Otherwise the token stays remembered and is claimed after they confirm
      // and sign in.
      toast({
        title: 'Check your email',
        description: "We've sent a confirmation link. Verify your email, then sign in.",
      });
      navigate('/client-portal/login');
    } catch (error: any) {
      toast({ title: 'Signup failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSignInAndClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const password = new FormData(e.currentTarget as HTMLFormElement).get('password');
    try {
      if (typeof password !== 'string') throw new Error('Please enter your password.');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await claimPortal(fullName);
      toast({ title: 'Portal connected', description: 'Welcome to your client portal.' });
      navigate('/client-portal');
    } catch (error: any) {
      toast({ title: 'Sign in failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };


  if (inviteStatus === 'checking') {
    return (
      <Shell
        icon={<Loader2 className="h-6 w-6 text-primary animate-spin" />}
        title="One moment"
        description="Checking your invitation…"
      />
    );
  }

  if (inviteStatus === 'expired' || inviteStatus === 'used' || inviteStatus === 'invalid') {
    const copy = {
      expired: {
        title: 'This link has expired',
        description:
          'Invitation links are valid for 7 days. Ask your agent to send a new one and it will land in your inbox within a minute.',
        icon: <Clock className="h-6 w-6 text-primary" />,
      },
      used: {
        title: 'This link has already been used',
        description:
          'Your portal is already set up. Sign in below — or ask your agent for a new invitation if you can\u2019t get in.',
        icon: <ShieldAlert className="h-6 w-6 text-primary" />,
      },
      invalid: {
        title: 'This invitation isn\u2019t valid',
        description:
          'The link is incomplete or was never issued. Ask your agent to send you a fresh portal invitation.',
        icon: <ShieldAlert className="h-6 w-6 text-primary" />,
      },
    }[inviteStatus];

    return (
      <Shell icon={copy.icon} title={copy.title} description={copy.description}>
        <div className="space-y-3">
          <Button asChild className="w-full">
            <Link to="/client-portal/login">Sign in to your portal</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <a href={`mailto:${tenant.supportEmail}?subject=New%20client%20portal%20invitation`}>
              Request a new invitation
            </a>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Forgot your password?{' '}
            <Link to="/forgot-password" className="text-primary hover:underline">
              Reset it here
            </Link>
          </p>
        </div>
      </Shell>
    );
  }

  if (existingAccount) {
    return (
      <Shell
        icon={<Building2 className="h-6 w-6 text-primary" />}
        title="Welcome back"
        description="You already have an account with this email. Sign in and we'll connect your portal."
      >
        <form onSubmit={handleSignInAndClaim} className="space-y-4">
          <Input type="email" value={email} disabled className="bg-background/50 opacity-70" />
          <Input
            type="password"
            name="password"
            placeholder="Password"
            required
            autoComplete="current-password"
            className="bg-background/50 border-border focus:border-primary"
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting your portal…
              </>
            ) : (
              'Sign in and open my portal'
            )}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Forgot your password?{' '}
          <Link to="/forgot-password" className="text-primary hover:underline">
            Reset it
          </Link>{' '}
          — your invitation stays valid.
        </p>
      </Shell>
    );
  }

  return (
    <Shell
      icon={<Building2 className="h-6 w-6 text-primary" />}
      title="Create Account"
      description="Set up your client portal access"
    >
      <form onSubmit={handleSignUp} className="space-y-4">
        <div>
          <Input
            type="text"
            placeholder="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="bg-background/50 border-border focus:border-primary"
          />
        </div>
        <div>
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled
            className="bg-background/50 border-border focus:border-primary disabled:opacity-70"
          />
        </div>
        <div>
          <Input
            type="password"
            name="password"
            placeholder="Password"
            required
            minLength={6}
            autoComplete="new-password"
            className="bg-background/50 border-border focus:border-primary"
          />
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account...
            </>
          ) : (
            'Create Account'
          )}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/client-portal/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </Shell>
  );
};

export default ClientSignup;
