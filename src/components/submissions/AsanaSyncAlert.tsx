import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ExternalLink, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { tenant } from '@/config/tenant';

interface FlaggedSubmission {
  id: string;
  form_type: string;
  agent_name: string | null;
  client_name: string | null;
  property_address: string | null;
  created_at: string;
  asana_task_url: string | null;
  asana_pushed_at: string | null;
  asana_attachments_sent: number | null;
  asana_attachments_uploaded: number | null;
  fileCount: number;
  paths: string[];
}

const FILE_KEYS = ['attachments', 'bra_reco_files', 'ids_files', 'fintracker_files', 'other_docs_files'];

// Asana sync tracking went live on this date. Submissions created before it
// were never meant to create Asana tasks, so they must not be flagged.
const ASANA_TRACKING_START = '2026-07-27T00:00:00Z';

const VISIBLE_LIMIT = 5;

const collectPaths = (row: any): string[] =>
  FILE_KEYS.flatMap((key) => (Array.isArray(row[key]) ? (row[key] as string[]) : []));

/**
 * Flags submissions that have uploaded files but where the Asana push
 * attached fewer files than were sent (or was never recorded at all).
 */
export function AsanaSyncAlert() {
  const [flagged, setFlagged] = useState<FlaggedSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('submissions')
      .select(
        'id, form_type, agent_name, client_name, property_address, created_at, attachments, bra_reco_files, ids_files, fintracker_files, other_docs_files, asana_task_url, asana_pushed_at, asana_attachments_sent, asana_attachments_uploaded'
      )
      .gte('created_at', ASANA_TRACKING_START)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      const rows = (data as any[])
        .map((row) => {
          const paths = collectPaths(row);
          return { ...row, paths, fileCount: paths.length };
        })
        // Flag anything that never reached Asana, or landed with fewer files than uploaded
        .filter((row) =>
          !row.asana_pushed_at
            ? true
            : row.fileCount > 0 && (row.asana_attachments_uploaded ?? 0) < row.fileCount
        );
      setFlagged(rows as FlaggedSubmission[]);
    }
    setLoading(false);
  };

  const pushToAsana = async (row: FlaggedSubmission) => {
    setPushingId(row.id);
    try {
      const { data: settings } = await supabase.from('asana_settings').select('projects').limit(1).single();
      const projectId = (settings?.projects as any)?.[row.form_type];

      const { data, error } = await supabase.functions.invoke('asana-create-task', {
        body: {
          form_type: row.form_type,
          submission_id: row.id,
          client_name: row.client_name,
          agent_name: row.agent_name,
          property_address: row.property_address,
          project_id: projectId || undefined,
          attachment_urls: row.paths.map((p) => ({
            url: '',
            name: p.split('/').pop() || 'file',
            path: p,
          })),
        },
      });
      if (error) throw error;

      const uploaded = (data as any)?.attachments_uploaded ?? 0;
      if (row.fileCount > 0 && uploaded < row.fileCount) {
        toast.warning(`Task created, but only ${uploaded} of ${row.fileCount} files attached.`);
      } else {
        toast.success('Pushed to Asana.');
      }
      await load();
    } catch (e: any) {
      console.error('Re-push to Asana failed:', e);
      toast.error('Failed to push to Asana');
    } finally {
      setPushingId(null);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading || flagged.length === 0) return null;

  const visible = expanded ? flagged : flagged.slice(0, VISIBLE_LIMIT);

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between gap-2">
        <span>
          {flagged.length} submission{flagged.length > 1 ? 's' : ''} not fully synced to Asana
        </span>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </AlertTitle>
      <AlertDescription>
        <p className="mb-2 text-sm">
          Everything is safe in {tenant.appName}, but these either never created an Asana task or arrived with
          missing files. Use Push to Asana to retry.
        </p>
        <ul className="space-y-1.5">
          {visible.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium capitalize">{row.form_type.replace('_', ' ')}</span>
              <span>
                {row.client_name || row.property_address || 'Untitled'}
                {row.agent_name ? ` — ${row.agent_name}` : ''}
              </span>
              <span className="opacity-80">
                {row.asana_pushed_at
                  ? `(${row.asana_attachments_uploaded ?? 0} of ${row.fileCount} files attached)`
                  : `(no Asana task${row.fileCount ? ` — ${row.fileCount} files` : ''})`}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                disabled={pushingId === row.id}
                onClick={() => pushToAsana(row)}
              >
                <Upload className="mr-1 h-3 w-3" />
                {pushingId === row.id ? 'Pushing…' : 'Push to Asana'}
              </Button>
              {row.asana_task_url && (
                <a
                  href={row.asana_task_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  Open task <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
        {flagged.length > VISIBLE_LIMIT && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 px-0 underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show less' : `Show all ${flagged.length}`}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}