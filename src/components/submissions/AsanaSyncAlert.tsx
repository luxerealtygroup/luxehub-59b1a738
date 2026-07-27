import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

interface FlaggedSubmission {
  id: string;
  form_type: string;
  agent_name: string | null;
  client_name: string | null;
  property_address: string | null;
  created_at: string;
  asana_task_url: string | null;
  asana_attachments_sent: number | null;
  asana_attachments_uploaded: number | null;
  fileCount: number;
}

const countFiles = (row: any) =>
  ['attachments', 'bra_reco_files', 'ids_files', 'fintracker_files', 'other_docs_files']
    .reduce((sum, key) => sum + (Array.isArray(row[key]) ? row[key].length : 0), 0);

/**
 * Flags submissions that have uploaded files but where the Asana push
 * attached fewer files than were sent (or was never recorded at all).
 */
export function AsanaSyncAlert() {
  const [flagged, setFlagged] = useState<FlaggedSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('submissions')
      .select(
        'id, form_type, agent_name, client_name, property_address, created_at, attachments, bra_reco_files, ids_files, fintracker_files, other_docs_files, asana_task_url, asana_pushed_at, asana_attachments_sent, asana_attachments_uploaded'
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      const rows = (data as any[])
        .map((row) => ({ ...row, fileCount: countFiles(row) }))
        // Only rows that actually had files AND were pushed to Asana with a shortfall
        .filter(
          (row) =>
            row.fileCount > 0 &&
            row.asana_pushed_at &&
            (row.asana_attachments_uploaded ?? 0) < row.fileCount
        );
      setFlagged(rows as FlaggedSubmission[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (loading || flagged.length === 0) return null;

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between gap-2">
        <span>
          {flagged.length} submission{flagged.length > 1 ? 's' : ''} with incomplete Asana attachments
        </span>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </AlertTitle>
      <AlertDescription>
        <p className="mb-2 text-sm">
          Files are safe in LUXEhub, but fewer files reached the Asana task than were uploaded.
        </p>
        <ul className="space-y-1.5">
          {flagged.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium capitalize">{row.form_type.replace('_', ' ')}</span>
              <span>
                {row.client_name || row.property_address || 'Untitled'}
                {row.agent_name ? ` — ${row.agent_name}` : ''}
              </span>
              <span className="opacity-80">
                ({row.asana_attachments_uploaded ?? 0} of {row.fileCount} files attached)
              </span>
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
      </AlertDescription>
    </Alert>
  );
}