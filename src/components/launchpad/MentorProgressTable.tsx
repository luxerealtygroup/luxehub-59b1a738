import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { MenteeProgressRow } from '@/hooks/useLaunchpad';

export function MentorProgressTable({ rows }: { rows: MenteeProgressRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No agents assigned to you yet.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agent</TableHead>
          <TableHead>Track</TableHead>
          <TableHead>Modules complete</TableHead>
          <TableHead>Current module</TableHead>
          <TableHead>Last activity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.full_name || 'Unnamed'}</TableCell>
            <TableCell>
              {r.launchpad_track ? (
                <Badge variant="secondary" className="capitalize">{r.launchpad_track}</Badge>
              ) : (
                <span className="text-muted-foreground text-sm">Not set</span>
              )}
            </TableCell>
            <TableCell>{r.modulesComplete} of {r.totalModules}</TableCell>
            <TableCell className="text-sm">{r.currentModule || '—'}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {r.lastActivity ? format(new Date(r.lastActivity), 'MMM d, yyyy') : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}