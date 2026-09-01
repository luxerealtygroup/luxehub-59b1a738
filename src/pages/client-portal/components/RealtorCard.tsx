import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Mail, MessageCircle, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tenant } from '@/config/tenant';

interface Realtor {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface Props {
  portalId: string;
  /** Jump to the messages tab. */
  onMessage?: () => void;
}

export function RealtorCard({ portalId, onMessage }: Props) {
  const [realtor, setRealtor] = useState<Realtor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('get_portal_realtor', { _portal_id: portalId });
      if (cancelled) return;
      setRealtor(((data as Realtor[]) ?? [])[0] ?? null);
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

  return (
    <div className="luxe-card p-6">
      <p className="eyebrow">Your Realtor</p>
      {loading ? (
        <div className="mt-4 h-14 rounded-xl bg-muted/60 animate-pulse" />
      ) : realtor ? (
        <>
          <div className="mt-4 flex items-center gap-4">
            <Avatar className="h-14 w-14 ring-1 ring-border/70">
              {realtor.avatar_url && <AvatarImage src={realtor.avatar_url} alt={realtor.full_name || 'Realtor'} />}
              <AvatarFallback className="bg-primary/10 text-primary font-medium">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold tracking-tight truncate">
                {realtor.full_name || 'Your Realtor'}
              </p>
              <p className="text-sm text-muted-foreground truncate">{tenant.brokerageName}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {onMessage && (
              <Button size="sm" className="rounded-full" onClick={onMessage}>
                <MessageCircle className="mr-1.5 h-4 w-4" /> Message
              </Button>
            )}
            {realtor.email && (
              <Button asChild size="sm" variant="outline" className="rounded-full">
                <a href={`mailto:${realtor.email}`}>
                  <Mail className="mr-1.5 h-4 w-4" /> Email
                </a>
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
          <UserRound className="h-5 w-5" />
          Your realtor will appear here once your portal is fully set up.
        </div>
      )}
    </div>
  );
}
