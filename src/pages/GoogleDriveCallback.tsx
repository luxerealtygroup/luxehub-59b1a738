import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

export default function GoogleDriveCallback() {
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const errParam = params.get('error');
      if (errParam) {
        setError(errParam);
        setState('error');
        return;
      }
      if (!code) {
        setError('Missing authorization code');
        setState('error');
        return;
      }
      const { error: fnErr } = await supabase.functions.invoke('google-drive-files', {
        body: {
          action: 'exchange_code',
          code,
          redirect_uri: `${window.location.origin}/agent/google-drive/callback`,
        },
      });
      if (fnErr) {
        setError(fnErr.message);
        setState('error');
        return;
      }
      setState('done');
      const returnTo = sessionStorage.getItem('gdrive_return_to');
      sessionStorage.removeItem('gdrive_return_to');
      setTimeout(() => {
        window.location.href =
          returnTo && returnTo.startsWith(window.location.origin) ? returnTo : '/';
      }, 800);
    };
    run();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
          {state === 'working' && (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-lg font-medium">Connecting your Google Drive…</p>
            </>
          )}
          {state === 'done' && (
            <>
              <CheckCircle2 className="h-10 w-10 text-green-600" />
              <p className="text-lg font-medium">Google Drive connected</p>
              <p className="text-sm text-muted-foreground">Returning you to your portal…</p>
            </>
          )}
          {state === 'error' && (
            <>
              <XCircle className="h-10 w-10 text-destructive" />
              <p className="text-lg font-medium">Connection failed</p>
              {error && <p className="text-sm text-muted-foreground">{error}</p>}
              <Button onClick={() => (window.location.href = '/')}>Back to app</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}