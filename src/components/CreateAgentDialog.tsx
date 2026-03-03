import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { UserPlus, Loader2, Copy, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CreateAgentDialogProps {
  onAgentCreated?: () => void;
}

export function CreateAgentDialog({ onAgentCreated }: CreateAgentDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [fubUserId, setFubUserId] = useState('');
  const [result, setResult] = useState<{ email: string; temp_password: string; full_name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-agent', {
        body: {
          first_name: firstName,
          last_name: lastName,
          email,
          fub_user_id: fubUserId || null,
        },
      });

      if (error) {
        toast({ title: 'Error creating agent', description: error.message, variant: 'destructive' });
        return;
      }

      if (data?.error) {
        toast({ title: 'Error creating agent', description: data.error, variant: 'destructive' });
        return;
      }

      setResult({ email: data.email, temp_password: data.temp_password, full_name: data.full_name });
      toast({ title: 'Agent created successfully!', description: `${data.full_name} has been added as an agent.` });
      onAgentCreated?.();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create agent', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const copyCredentials = () => {
    if (!result) return;
    navigator.clipboard.writeText(`Email: ${result.email}\nTemporary Password: ${result.temp_password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setOpen(false);
    setFirstName('');
    setLastName('');
    setEmail('');
    setFubUserId('');
    setResult(null);
    setCopied(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : handleClose()}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-gold/30 text-gold hover:bg-gold/10">
          <UserPlus className="h-4 w-4 mr-2" />
          Add Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Create New Agent
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-500">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Agent created successfully!</span>
            </div>
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <p className="text-sm"><span className="text-muted-foreground">Name:</span> {result.full_name}</p>
              <p className="text-sm"><span className="text-muted-foreground">Email:</span> {result.email}</p>
              <p className="text-sm"><span className="text-muted-foreground">Temporary Password:</span> <code className="bg-background px-1 rounded">{result.temp_password}</code></p>
            </div>
            <p className="text-xs text-muted-foreground">Share these credentials with the agent securely. They should change their password after first login.</p>
            <div className="flex gap-2">
              <Button onClick={copyCredentials} variant="outline" className="flex-1">
                {copied ? <><CheckCircle className="h-4 w-4 mr-2" />Copied!</> : <><Copy className="h-4 w-4 mr-2" />Copy Credentials</>}
              </Button>
              <Button onClick={handleClose} className="flex-1">Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required placeholder="John" />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required placeholder="Doe" />
              </div>
            </div>
            <div>
              <Label htmlFor="agentEmail">Email *</Label>
              <Input id="agentEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="john@example.com" />
            </div>
            <div>
              <Label htmlFor="fubUserId">Follow Up Boss User ID <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input id="fubUserId" type="number" value={fubUserId} onChange={(e) => setFubUserId(e.target.value)} placeholder="Leave blank if no FUB connection" />
              <p className="text-xs text-muted-foreground mt-1">If left blank, the agent will operate without FUB sync and can enter data manually.</p>
            </div>
            <Button type="submit" disabled={loading || !firstName || !lastName || !email} className="w-full bg-gold text-gold-foreground hover:bg-gold/90">
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : 'Create Agent'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
