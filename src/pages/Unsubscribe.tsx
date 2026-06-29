import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State = 'loading' | 'ready' | 'already' | 'invalid' | 'submitting' | 'done' | 'error';

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`, {
          headers: { apikey: SUPABASE_ANON_KEY },
        });
        const data = await res.json();
        if (!res.ok) { setState('invalid'); return; }
        if (data.valid === false && data.reason === 'already_unsubscribed') { setState('already'); return; }
        if (data.valid) { setState('ready'); return; }
        setState('invalid');
      } catch {
        setState('invalid');
      }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setState('submitting');
    const { data, error } = await supabase.functions.invoke('handle-email-unsubscribe', { body: { token } });
    if (error) { setState('error'); setMessage(error.message); return; }
    if ((data as any)?.success) { setState('done'); return; }
    if ((data as any)?.reason === 'already_unsubscribed') { setState('already'); return; }
    setState('error');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        <h1 className="font-display text-2xl font-semibold">Email Preferences</h1>
        {state === 'loading' && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Verifying link…
          </div>
        )}
        {state === 'ready' && (
          <>
            <p className="text-muted-foreground">Click below to unsubscribe from emails from LuxeHub.</p>
            <Button onClick={confirm} className="w-full">Confirm Unsubscribe</Button>
          </>
        )}
        {state === 'submitting' && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Unsubscribing…
          </div>
        )}
        {state === 'done' && (
          <div className="space-y-2">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
            <p>You've been unsubscribed. You won't receive further emails.</p>
          </div>
        )}
        {state === 'already' && (
          <div className="space-y-2">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
            <p>This email address is already unsubscribed.</p>
          </div>
        )}
        {state === 'invalid' && (
          <div className="space-y-2">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <p>This unsubscribe link is invalid or expired.</p>
          </div>
        )}
        {state === 'error' && (
          <div className="space-y-2">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <p>Something went wrong{message ? `: ${message}` : ''}. Please try again.</p>
          </div>
        )}
      </Card>
    </div>
  );
}