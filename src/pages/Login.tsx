import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getRoleBasedRedirect } from '@/lib/utils/roleRedirect';
import { cn } from '@/lib/utils';
import { User, Building2 } from 'lucide-react';
import luxeLogo from '@/assets/luxe-logo.png.asset.json';

type LoginMode = 'realtor' | 'client';

const Login = () => {
  const [mode, setMode] = useState<LoginMode>('realtor');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    if (mode === 'realtor') {
      const { error } = await signIn(email, password);
      
      if (error) {
        toast({
          title: "Login failed",
          description: error.message,
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // Get current user and redirect based on role
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const redirect = await getRoleBasedRedirect(user.id);
        navigate(redirect);
      } else {
        navigate('/dashboard');
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        toast({
          title: "Login failed",
          description: error.message,
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // Check if user is a client
      const { data: clientAccount } = await supabase
        .from('client_accounts')
        .select('id')
        .eq('user_id', data.user?.id)
        .maybeSingle();

      if (!clientAccount) {
        await supabase.auth.signOut();
        toast({
          title: "Access denied",
          description: "This portal is for clients only. Please use the agent login.",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      navigate('/client-portal');
    }
    
    setLoading(false);
  };

  const isRealtor = mode === 'realtor';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className={cn(
        "w-full max-w-md border bg-card/50 backdrop-blur",
        isRealtor ? "border-gold/20" : "border-border/50"
      )}>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img
              src={luxeLogo.url}
              alt="LUXE Realty Group"
              className="mx-auto h-auto max-h-32 w-auto object-contain"
            />
          </div>
          <CardTitle className={cn(
            "text-3xl font-display",
            isRealtor ? "text-gold" : "text-primary"
          )}>
            {isRealtor ? 'Welcome Back' : 'Client Portal'}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {isRealtor ? 'Sign in to your real estate hub' : 'Access your real estate documents'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg border border-border/50 bg-background/50 p-1">
            <button
              type="button"
              onClick={() => setMode('realtor')}
              className={cn(
                "flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                isRealtor
                  ? "bg-gold text-gold-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <User className="h-4 w-4" />
              I'm a Realtor
            </button>
            <button
              type="button"
              onClick={() => setMode('client')}
              className={cn(
                "flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                !isRealtor
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <Building2 className="h-4 w-4" />
              I'm a Client
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={cn(
                  "bg-background/50 border-border",
                  isRealtor ? "focus:border-gold" : "focus:border-primary"
                )}
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={cn(
                  "bg-background/50 border-border",
                  isRealtor ? "focus:border-gold" : "focus:border-primary"
                )}
              />
            </div>
            <Button 
              type="submit" 
              disabled={loading}
              className={cn(
                "w-full",
                isRealtor
                  ? "bg-gold text-gold-foreground hover:bg-gold/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="mt-2 text-center text-sm">
            <Link to="/forgot-password" className={cn(
              "hover:underline",
              isRealtor ? "text-gold" : "text-primary"
            )}>
              Forgot Password?
            </Link>
          </p>

          {isRealtor ? (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/signup" className="text-gold hover:underline">
                Sign up
              </Link>
            </p>
          ) : (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/client-portal/signup" className="text-primary hover:underline">
                Sign up
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
