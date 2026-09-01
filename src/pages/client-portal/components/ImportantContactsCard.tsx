import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Mail, MessageCircle, Phone, Users, Globe } from 'lucide-react';
import { tenant } from '@/config/tenant';
import type { PortalContact } from '@/components/portal/PortalContactsPanel';

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
  /** Jump to the contacts tab. */
  onViewAll?: () => void;
}

/**
 * Dashboard "Important contacts" card: the client's realtor plus any portal
 * contacts (lawyer, mortgage broker, home inspector…) flagged
 * `show_on_dashboard`. Contacts are managed in the Contacts tab.
 */
export function ImportantContactsCard({ portalId, onMessage, onViewAll }: Props) {
  const [realtor, setRealtor] = useState<Realtor | null>(null);
  const [contacts, setContacts] = useState<PortalContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: r }, { data: c }] = await Promise.all([
        supabase.rpc('get_portal_realtor', { _portal_id: portalId }),
        supabase
          .from('portal_contacts')
          .select('*')
          .eq('portal_id', portalId)
          .eq('is_internal', false)
          .order('created_at', { ascending: true }),
      ]);
      if (cancelled) return;
      setRealtor(((r as Realtor[]) ?? [])[0] ?? null);
      // show_on_dashboard is new; tolerate it being absent on stale types.
      const list = ((c as PortalContact[]) ?? []).filter(
        (x) => (x as PortalContact & { show_on_dashboard?: boolean }).show_on_dashboard,
      );
      setContacts(list);
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
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">Important contacts</p>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-medium text-primary hover:underline"
          >
            View all
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          <div className="h-14 rounded-xl bg-muted/60 animate-pulse" />
          <div className="h-10 rounded-xl bg-muted/60 animate-pulse" />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Realtor first — always pinned. */}
          {realtor ? (
            <div>
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 ring-1 ring-border/70">
                  {realtor.avatar_url && <AvatarImage src={realtor.avatar_url} alt={realtor.full_name || 'Realtor'} />}
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium truncate">{realtor.full_name || 'Your Realtor'}</p>
                  <p className="text-xs text-muted-foreground truncate">Your Realtor · {tenant.brokerageName}</p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {onMessage && (
                  <Button size="sm" className="rounded-full h-8" onClick={onMessage}>
                    <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Message
                  </Button>
                )}
                {realtor.email && (
                  <Button asChild size="sm" variant="outline" className="rounded-full h-8">
                    <a href={`mailto:${realtor.email}`}>
                      <Mail className="mr-1.5 h-3.5 w-3.5" /> Email
                    </a>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your realtor will appear here once your portal is fully set up.
            </p>
          )}

          {/* Featured contacts from the portal contact list. */}
          {contacts.length > 0 && (
            <div className="space-y-3 border-t border-border/60 pt-4">
              {contacts.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[c.role, c.company].filter(Boolean).join(' · ') || 'Contact'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        title={c.phone}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:text-primary hover:border-primary/40"
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        title={c.email}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:text-primary hover:border-primary/40"
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {c.website && (
                      <a
                        href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                        target="_blank"
                        rel="noreferrer"
                        title={c.website}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:text-primary hover:border-primary/40"
                      >
                        <Globe className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {contacts.length === 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
              <Users className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Add your lawyer, mortgage broker or home inspector in the Contacts tab and mark them
                "Show on dashboard" to see them here.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
