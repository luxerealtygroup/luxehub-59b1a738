import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Building2, Loader2 } from 'lucide-react';

const ClientSignup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Pre-fill email if provided in URL (from invitation)
  useEffect(() => {
    const inviteEmail = searchParams.get('email');
    if (inviteEmail) {
      setEmail(inviteEmail);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Sign up the user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/confirm`
        }
      });

      if (authError) throw authError;

      if (!authData.user || authData.user.identities?.length === 0) {
        throw new Error('An account with this email already exists. Please sign in instead.');
      }

      // Create client account record
      const { error: clientError } = await supabase
        .from('client_accounts')
        .insert({
          user_id: authData.user.id,
          email: email.toLowerCase(),
          full_name: fullName,
          fub_person_id: searchParams.get('fub_id') ? parseInt(searchParams.get('fub_id')!) : null,
          invited_by: searchParams.get('invited_by') || null
        });

      if (clientError) {
        console.error('Error creating client account:', clientError);
      }

      toast({
        title: "Check your email",
        description: "We've sent a confirmation link. Please verify your email to continue.",
      });

      navigate('/client-portal/login');
    } catch (error: any) {
      toast({
        title: "Signup failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-3xl font-display text-primary">Create Account</CardTitle>
          <CardDescription className="text-muted-foreground">
            Set up your client portal access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                disabled={!!searchParams.get('email')}
                className="bg-background/50 border-border focus:border-primary disabled:opacity-70"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
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
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientSignup;
