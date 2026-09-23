import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface Participant {
  user_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role_label: string | null;
  is_client: boolean;
  sort_order: number;
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

/**
 * Who is in this conversation. Read live from the portal's actual participants,
 * so changing the assigned agent or adding/removing a client care person is
 * reflected here with no extra bookkeeping.
 */
export function ThreadParticipants({
  portalId,
  viewerRole,
}: {
  portalId: string;
  viewerRole: 'client' | 'agent';
}) {
  const [people, setPeople] = useState<Participant[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('get_portal_participants', { _portal_id: portalId });
      if (!cancelled) setPeople(((data as Participant[]) ?? []).filter((p) => p.full_name));
    })();
    return () => {
      cancelled = true;
    };
  }, [portalId]);

  if (!people.length) return null;

  return (
    <div className="border-b border-border/60 bg-background/70 px-4 sm:px-6 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">
        {viewerRole === 'client' ? 'Your team' : 'In this conversation'}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {people
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((p) => (
            <div key={`${p.user_id}-${p.full_name}`} className="flex items-center gap-2 min-w-0">
              <Avatar className="h-7 w-7 ring-1 ring-border/70">
                {p.avatar_url && <AvatarImage src={p.avatar_url} alt={p.full_name ?? ''} />}
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                  {initials(p.full_name ?? '')}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 leading-tight">
                <p className="text-xs font-medium truncate">{p.full_name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {p.is_client ? 'Client' : p.role_label}
                </p>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
