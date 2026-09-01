import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Camera, Loader2, Mail, CheckCircle2, Trash2 } from 'lucide-react';
import { AVATAR_BUCKET, resolveAvatarUrl } from '@/lib/avatar';

const AccountSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      const path = data?.avatar_url ?? null;
      setAvatarPath(path);
      setAvatarSrc(await resolveAvatarUrl(path));
    })();
  }, [user]);

  const handleHeadshot = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Please choose an image file', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Headshots are capped at 5 MB.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${user.id}/headshot.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setUploading(false);
      toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
      return;
    }
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ avatar_url: path })
      .eq('id', user.id);
    setUploading(false);
    if (profileError) {
      toast({ title: 'Could not save headshot', description: profileError.message, variant: 'destructive' });
      return;
    }
    setAvatarPath(path);
    setAvatarSrc(await resolveAvatarUrl(path));
    toast({ title: 'Headshot updated', description: 'It now shows on your profile and your clients\' portals.' });
  };

  const removeHeadshot = async () => {
    if (!user || !avatarPath) return;
    setUploading(true);
    if (!/^https?:\/\//i.test(avatarPath)) {
      await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath]);
    }
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id);
    setUploading(false);
    if (error) {
      toast({ title: 'Could not remove headshot', description: error.message, variant: 'destructive' });
      return;
    }
    setAvatarPath(null);
    setAvatarSrc(null);
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newEmail || newEmail === user?.email) {
      toast({
        title: "Invalid email",
        description: "Please enter a different email address.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      email: newEmail,
    }, {
      emailRedirectTo: `${window.location.origin}/dashboard/settings`,
    });

    if (error) {
      toast({
        title: "Email change failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setSent(true);
      toast({
        title: "Confirmation sent",
        description: "Check both your current and new email for confirmation links.",
      });
    }

    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Account Settings</h1>
        <p className="text-muted-foreground">Manage your account preferences</p>
      </div>

      <Card className="border-border/50 max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Camera className="h-5 w-5 text-gold" />
            Your Headshot
          </CardTitle>
          <CardDescription>
            Shown on your agent profile and in the "Important contacts" card on your clients' portals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20 ring-1 ring-border/70">
              {avatarSrc && <AvatarImage src={avatarSrc} alt="Your headshot" />}
              <AvatarFallback className="bg-gold/15 text-gold text-xl font-semibold">
                {user?.email?.slice(0, 2).toUpperCase() ?? 'ME'}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleHeadshot(f);
                  e.target.value = '';
                }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…</>
                ) : (
                  <><Camera className="mr-2 h-4 w-4" /> {avatarSrc ? 'Replace photo' : 'Upload photo'}</>
                )}
              </Button>
              {avatarSrc && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={uploading}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => void removeHeadshot()}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Remove
                </Button>
              )}
              <p className="text-xs text-muted-foreground">JPG or PNG, up to 5 MB.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5 text-gold" />
            Change Email
          </CardTitle>
          <CardDescription>
            Current email: <span className="font-medium text-foreground">{user?.email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Confirmation emails sent</p>
                <p className="text-sm text-muted-foreground">
                  We've sent confirmation links to both your current email and <span className="font-medium">{newEmail}</span>. 
                  Please confirm both to complete the change.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-gold hover:text-gold/80"
                  onClick={() => { setSent(false); setNewEmail(''); }}
                >
                  Change to a different email
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleEmailChange} className="space-y-4">
              <div>
                <Input
                  type="email"
                  placeholder="New email address"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="bg-background/50 border-border focus:border-gold"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="bg-gold text-gold-foreground hover:bg-gold/90"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending confirmation…
                  </>
                ) : (
                  'Update Email'
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountSettings;
