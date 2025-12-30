import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { UserPlus, Copy, Check } from 'lucide-react';

interface ClientInviteDialogProps {
  clientName?: string;
  clientEmail?: string;
  fubPersonId?: number;
}

export function ClientInviteDialog({ clientName, clientEmail, fubPersonId }: ClientInviteDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(clientEmail || '');
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const generateInviteLink = () => {
    const baseUrl = window.location.origin;
    const params = new URLSearchParams();
    
    if (email) params.set('email', email);
    if (fubPersonId) params.set('fub_id', fubPersonId.toString());
    if (user?.id) params.set('invited_by', user.id);
    
    return `${baseUrl}/client-portal/signup?${params.toString()}`;
  };

  const inviteLink = generateInviteLink();

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast({
        title: "Link copied!",
        description: "Share this link with your client to invite them to the portal.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Please copy the link manually.",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite to Portal
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Client to Portal</DialogTitle>
          <DialogDescription>
            Generate a personalized invitation link for {clientName || 'your client'} to access their documents.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="client-email">Client Email</Label>
            <Input
              id="client-email"
              type="email"
              placeholder="client@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Invitation Link</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={inviteLink}
                className="text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Share this link with your client. They'll be able to create an account and view documents you've uploaded for them.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
