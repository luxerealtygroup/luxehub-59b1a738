import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Mail, MessageCircle, UserRound } from 'lucide-react';
import { tenant } from '@/config/tenant';
import { resolveAvatarUrl } from '@/lib/avatar';

interface Realtor {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface Props {
  portalId: string;
  /** Jump to the messages section. */
  onMessage?: () => void;
}

/**
 * The assigned agent's contact card, shown on its own /client-portal/agent page.
 * Reads through the same `get_portal_realtor` RPC the dashboard card uses, so
 * access rules are unchanged.
 */
export function AgentContactCard({ portalId, onMessage }: Props) {
  const [realtor, setRealtor] = useState<Realtor | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('get_portal_realtor', { _portal_id: portalId });
      if (cancelled) return;
      const found = ((data as Realtor[]) ?? [])[0] ?? null;
      setRealtor(found);
      if (found?.avatar_url) {
        const src = await resolveAvatarUrl(found.avatar_url);
        if (!cancelled) setPhoto(src);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [portalId]);

  const initials = (realtor?.full_name || 'Your Realtor')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (loading) {
    return <div className="luxe-card h-48 animate-pulse" />;
  }

  if (!realtor) {
    return (
      <div className="luxe-card p-12 flex flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 mb-4">
          <UserRound className="h-6 w-6" />
        </div>
        <h3 className="font-display text-lg font-semibold tracking-tight mb-1">No agent yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Your realtor will appear here once your portal is fully set up.
        </p>
      </div>
    );
  }

  return (
    <div className="luxe-card p-8 max-w-xl">
      <p className="eyebrow">Your agent</p>
      <div className="mt-5 flex items-center gap-4">
        <Avatar className="h-16 w-16 ring-1 ring-border/70">
          {photo && <AvatarImage src={photo} alt={realtor.full_name || 'Realtor'} />}
          <AvatarFallback className="bg-primary/10 text-primary text-base font-medium">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold tracking-tight truncate">
            {realtor.full_name || 'Your Realtor'}
          </p>
          <p className="text-sm text-muted-foreground truncate">Your Realtor · {tenant.brokerageName}</p>
          {realtor.email && (
            <p className="text-sm text-muted-foreground truncate">{realtor.email}</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {onMessage && (
          <Button className="rounded-full" onClick={onMessage}>
            <MessageCircle className="mr-2 h-4 w-4" /> Send a message
          </Button>
        )}
        {realtor.email && (
          <Button asChild variant="outline" className="rounded-full">
            <a href={`mailto:${realtor.email}`}>
              <Mail className="mr-2 h-4 w-4" /> Email
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
