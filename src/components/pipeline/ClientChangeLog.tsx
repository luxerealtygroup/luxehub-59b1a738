import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { History } from 'lucide-react';
import { describeAudit, type ClientAuditEntry } from '@/lib/pipelineAudit';

/**
 * Shows the agent (and admins) every change somebody else made to this client.
 * Read-only by design — the log itself can never be edited or removed.
 */
export function ClientChangeLog({ clientId, compact = false }: { clientId: string; compact?: boolean }) {
  const [entries, setEntries] = useState<ClientAuditEntry[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('pipeline_client_audit')
        .select('id,client_id,owner_user_id,changed_by,field,old_value,new_value,created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(compact ? 1 : 25);
      if (cancelled) return;
      const rows = (data ?? []) as ClientAuditEntry[];
      setEntries(rows);
      const ids = Array.from(new Set(rows.map((r) => r.changed_by)));
      if (ids.length) {
        const { data: profiles } = await supabase.from('profiles').select('id,full_name').in('id', ids);
        if (cancelled) return;
        const map: Record<string, string> = {};
        (profiles ?? []).forEach((p: any) => (map[p.id] = p.full_name || 'Someone on the team'));
        setNames(map);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, compact]);

  if (!entries.length) return null;

  if (compact) {
    const e = entries[0];
    return (
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <History className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          Changed by {names[e.changed_by] ?? 'a teammate'} — {describeAudit(e)},{' '}
          {format(new Date(e.created_at), 'MMM d')}
        </span>
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/50 p-3">
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <History className="h-4 w-4" /> Change history
      </h4>
      <ul className="space-y-1.5 text-xs text-muted-foreground">
        {entries.map((e) => (
          <li key={e.id}>
            <span className="text-foreground">{names[e.changed_by] ?? 'A teammate'}</span> — {describeAudit(e)}
            <span className="ml-1">({format(new Date(e.created_at), 'MMM d, yyyy h:mma')})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
