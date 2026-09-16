import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Loader2, MailCheck } from 'lucide-react';
import { isValidEmail } from '@/lib/validation/email';
import { tenant } from '@/config/tenant';

/**
 * Public page a client can reach from any static link (e.g. the Follow Up Boss
 * welcome email). Never reveals whether an address is on file.
 */
const RequestAccess = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [params] = useSearchParams();

  // Set when we bounced someone here from a dead activation link.
  const reason = params.get('reason');
  const reasonNote =
    reason === 'expired'
      ? 'That activation link has expired. Enter your email below and we will send you a fresh one.'
      : reason === 'used'
        ? 'That activation link has already been used. Enter your email below and we will send you a new link to get back in.'
        : reason === 'invalid'
          ? 'That link is no longer valid. Enter your email below and we will send you a fresh one.'
          : null;


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) return;
    setLoading(true);
    try {
      await supabase.functions.invoke('portal-request-access', {
        body: { email: email.trim().toLowerCase() },
      });
    } catch {
      /* the confirmation is deliberately identical either way */
    }
    setLoading(false);
    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-2xl font-light tracking-wide">
            {tenant.appName} Client Portal
          </CardTitle>
          <CardDescription>
            Enter the email address your agent has on file and we'll send you a link to your portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="text-center space-y-4 py-4">
              <MailCheck className="h-8 w-8 mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">
                If that email address is on a client portal, we have just sent a link to it. Please
                check your inbox, including spam.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="request-email">Email address</Label>
                <Input
                  id="request-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={loading || !email}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Send me my portal link
              </Button>
            </form>
          )}
          <p className="text-xs text-muted-foreground text-center mt-6">
            Already have an account? <Link to="/client-portal/login" className="underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default RequestAccess;
