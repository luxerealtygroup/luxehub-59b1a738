import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Mail } from 'lucide-react';
import { tenant } from '@/config/tenant';

/**
 * The permanent per-agent QR target. Printed signs and postcards point here
 * forever; this page sends the visitor to whichever open house is live now.
 */
export default function AgentOpenHouseRedirect() {
  const { agentSlug = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<{ name: string | null; email: string | null; avatar: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.rpc('public_agent_open_house', { _agent_slug: agentSlug }).then(({ data }) => {
      if (!alive) return;
      const row = Array.isArray(data) ? (data[0] as any) : null;
      if (row?.active_slug) {
        window.location.replace(`/oh/${row.active_slug}`);
        return;
      }
      setAgent(row ? { name: row.agent_name, email: row.agent_email, avatar: row.agent_avatar_url } : null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [agentSlug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">{tenant.brokerageName}</p>
        {agent?.avatar && (
          <img
            src={agent.avatar}
            alt={agent.name || 'Agent'}
            className="mx-auto mt-6 h-24 w-24 rounded-full border border-gold/40 object-cover"
          />
        )}
        <h1 className="mt-6 font-display text-3xl font-semibold text-foreground">
          {agent?.name ? `${agent.name} isn't hosting right now` : 'No open house right now'}
        </h1>
        <p className="mt-3 text-muted-foreground">
          There's no open house running at the moment. Reach out any time and we'll arrange a private showing.
        </p>
        {agent?.email && (
          <a
            href={`mailto:${agent.email}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border-2 border-gold px-6 py-4 text-base font-medium text-foreground"
          >
            <Mail className="h-5 w-5 text-gold" /> {agent.email}
          </a>
        )}
        <p className="mt-8 text-sm text-muted-foreground">{tenant.websiteDomain}</p>
      </div>
    </div>
  );
}
