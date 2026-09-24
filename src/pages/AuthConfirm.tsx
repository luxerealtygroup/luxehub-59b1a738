import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { getRoleBasedRedirect } from '@/lib/utils/roleRedirect';
import { claimPendingInvite, readPendingInvite } from '@/lib/inviteLinks';
import { tenant } from '@/config/tenant';

const AuthConfirm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');

  useEffect(() => {
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    let failureTimer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;

    const finishConfirmation = async (userId: string) => {
      if (failureTimer) clearTimeout(failureTimer);
      const hadClientInvite = Boolean(readPendingInvite());
      if (hadClientInvite) {
        const claimed = await claimPendingInvite();
        if (!claimed) {
          setStatus('error');
          toast({
            title: 'Portal connection failed',
            description: 'Please open your invitation link again or request a fresh one.',
            variant: 'destructive',
          });
          redirectTimer = setTimeout(
            () => navigate('/client-portal/request-access?reason=invalid', { replace: true }),
            2000,
          );
          return;
        }
      }

      setStatus('success');
      toast({
        title: `Your email has been confirmed. Welcome to ${tenant.appName}.`,
      });
      const redirect = hadClientInvite ? '/client-portal' : await getRoleBasedRedirect(userId);
      redirectTimer = setTimeout(() => navigate(redirect, { replace: true }), 1500);
    };

    const handleConfirmation = async () => {
      try {
        // Supabase automatically exchanges the token from the URL hash
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (session) {
          await finishConfirmation(session.user.id);
        } else {
          // No session yet — listen for auth state change (token exchange may be async)
          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
              await finishConfirmation(session.user.id);
              subscription.unsubscribe();
            }
          });
          unsubscribe = () => subscription.unsubscribe();

          // Timeout fallback
          failureTimer = setTimeout(() => {
            subscription.unsubscribe();
            setStatus('error');
            toast({
              title: "Confirmation failed",
              description: "The link may have expired. Please try signing up again.",
              variant: "destructive",
            });
            redirectTimer = setTimeout(() => navigate('/login', { replace: true }), 2000);
          }, 10000);
        }
      } catch {
        setStatus('error');
        toast({
          title: "Confirmation failed",
          description: "Something went wrong. Please try again.",
          variant: "destructive",
        });
        redirectTimer = setTimeout(() => navigate('/login', { replace: true }), 2000);
      }
    };

    void handleConfirmation();
    return () => {
      unsubscribe?.();
      if (failureTimer) clearTimeout(failureTimer);
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [navigate, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {status === 'verifying' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-gold mx-auto" />
            <p className="text-muted-foreground">Confirming your email…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <p className="text-foreground font-display text-xl">Your email has been confirmed. Welcome to {tenant.appName}.</p>
          </>
        )}
        {status === 'error' && (
          <p className="text-destructive">Redirecting…</p>
        )}
      </div>
    </div>
  );
};

export default AuthConfirm;
