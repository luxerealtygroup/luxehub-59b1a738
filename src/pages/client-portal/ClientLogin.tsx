import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Building2 } from 'lucide-react';

const ClientLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
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
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-3xl font-display text-primary">Client Portal</CardTitle>
          <CardDescription className="text-muted-foreground">
            Access your real estate documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-background/50 border-border focus:border-primary"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-background/50 border-border focus:border-primary"
              />
            </div>
            <Button 
              type="submit" 
              disabled={loading}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Are you an agent?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Agent login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientLogin;
