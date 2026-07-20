import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event which fires when user clicks the reset link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true);
      }
    });

    // Handle different Supabase reset link formats
    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const token_hash = url.searchParams.get('token_hash');
      const type = url.searchParams.get('type') || hash.get('type');
      const code = url.searchParams.get('code');
      const error_description = url.searchParams.get('error_description') || hash.get('error_description');

      if (error_description) {
        toast({ title: 'Reset link invalid', description: error_description, variant: 'destructive' });
        return;
      }

      try {
        if (token_hash && type === 'recovery') {
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'recovery' });
          if (error) throw error;
          setReady(true);
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          setReady(true);
        } else {
          // Hash-fragment tokens are auto-handled by supabase-js and fire PASSWORD_RECOVERY.
          // Fallback: if a session already exists, allow the update.
          const { data } = await supabase.auth.getSession();
          if (data.session) setReady(true);
        }
      } catch (err: any) {
        toast({
          title: 'Reset link invalid or expired',
          description: err?.message ?? 'Please request a new password reset email.',
          variant: 'destructive',
        });
      }
    })();

    return () => subscription.unsubscribe();
  }, [toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      await supabase.auth.signOut();
      toast({
        title: "Password successfully updated.",
        description: "You can now sign in with your new password.",
      });
      navigate('/login', { replace: true });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-gold/20 bg-card/50 backdrop-blur">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-display text-gold">New Password</CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="bg-background/50 border-border focus:border-gold"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="bg-background/50 border-border focus:border-gold"
              />
            </div>
            <Button
              type="submit"
              disabled={loading || !ready}
              className="w-full bg-gold text-gold-foreground hover:bg-gold/90"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating…
                </>
              ) : !ready ? (
                'Verifying link…'
              ) : (
                'Update Password'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
