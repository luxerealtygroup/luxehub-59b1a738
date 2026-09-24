import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { KeyRound, Loader2 } from 'lucide-react';
import { PORTAL_CLAIM_FAILED_MESSAGE } from '@/lib/inviteLinks';

/** Forced first-sign-in step for accounts given a temporary password. */
const SetPassword = () => {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate('/client-portal/login', { replace: true });
      else if (!data.user.app_metadata?.must_change_password) navigate('/client-portal', { replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== confirm) return toast({ title: "Passwords don't match", variant: 'destructive' });
    if (pw.length < 8) return toast({ title: 'Use at least 8 characters', variant: 'destructive' });
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('temp-password?action=complete', {
      body: { new_password: pw },
    });
    if (error || !data?.password_changed) {
      let msg = 'Please try again.';
      try { msg = (await (error as any)?.context?.json())?.error ?? msg; } catch { /* keep default */ }
      toast({ title: 'Could not set your password', description: msg, variant: 'destructive' });
      setLoading(false);
      return;
    }
    await supabase.auth.refreshSession();
    if (data.claimed) {
      toast({ title: 'Password set', description: 'Welcome to your client portal.' });
      navigate('/client-portal', { replace: true });
    } else {
      toast({ title: 'Password set', description: PORTAL_CLAIM_FAILED_MESSAGE, variant: 'destructive' });
      navigate('/client-portal/request-access', { replace: true });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-3xl font-display text-primary">Choose your password</CardTitle>
          <CardDescription>You signed in with a temporary password. Set your own to open your portal.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Input type="password" placeholder="New password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} />
            <Input type="password" placeholder="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Set password and open my portal'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default SetPassword;
