import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, Receipt, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { formatCurrency } from '@/lib/utils';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { canSendInvoiceToSlack, invoiceSlackStatus } from './accountsPayableSlack';

interface AsanaTask {
  gid: string;
  name: string;
  due_on: string | null;
  completed: boolean;
  notes: string;
  custom_fields?: Array<{
    gid: string;
    name: string;
    display_value: string | null;
    number_value?: number;
  }>;
  permalink_url: string;
}

interface AccountsPayableProps {
  className?: string;
}

/** Legacy Asana view, kept until the Slack view is verified (phase 1). Not rendered. */
export const AsanaAccountsPayable = ({ className }: AccountsPayableProps) => {
  const [tasks, setTasks] = useState<AsanaTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string>('');
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);

  // Load saved project ID from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('asana_ap_project_id');
    if (saved) {
      setSavedProjectId(saved);
      setProjectId(saved);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchTasks = async (pid: string) => {
    if (!pid) return;
    
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('asana-create-task', {
        body: { action: 'get_tasks', project_id: pid }
      });

      if (fnError) throw fnError;

      if (data?.tasks) {
        console.log('Fetched tasks from Asana:', data.tasks.length, 'total');
        console.log('Incomplete tasks:', data.tasks.filter((t: AsanaTask) => !t.completed).length);
        console.log('Sample task:', data.tasks[0]);
        
        // Sort by due date (soonest first), then by name
        const sortedTasks = data.tasks.sort((a: AsanaTask, b: AsanaTask) => {
          if (!a.due_on && !b.due_on) return a.name.localeCompare(b.name);
          if (!a.due_on) return 1;
          if (!b.due_on) return -1;
          return a.due_on.localeCompare(b.due_on);
        });
        setTasks(sortedTasks);
      }
    } catch (err) {
      console.error('Error fetching AP tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (savedProjectId) {
      fetchTasks(savedProjectId);
    }
  }, [savedProjectId]);

  const handleSaveProject = () => {
    localStorage.setItem('asana_ap_project_id', projectId);
    setSavedProjectId(projectId);
  };

  const getAmountFromTask = (task: AsanaTask): number | null => {
    // Try to find "Invoice Amount" field specifically first
    const invoiceAmountField = task.custom_fields?.find(cf => 
      cf.name.toLowerCase() === 'invoice amount'
    );
    if (invoiceAmountField?.number_value != null) return invoiceAmountField.number_value;
    
    // Fallback to other amount-related fields
    const amountField = task.custom_fields?.find(cf => 
      cf.name.toLowerCase().includes('amount') || 
      cf.name.toLowerCase().includes('total')
    );
    if (amountField?.number_value != null) return amountField.number_value;
    
    // Try to extract from task name or notes
    const amountMatch = (task.name + ' ' + task.notes).match(/\$[\d,]+\.?\d*/);
    if (amountMatch) {
      return parseFloat(amountMatch[0].replace(/[$,]/g, ''));
    }
    return null;
  };

  const getDueStatus = (dueDate: string | null) => {
    if (!dueDate) return 'no-date';
    const date = parseISO(dueDate);
    if (isPast(date) && !isToday(date)) return 'overdue';
    if (isToday(date)) return 'due-today';
    return 'upcoming';
  };

  const openTasks = tasks.filter(t => !t.completed);

  const totalPayable = openTasks
    .reduce((sum, t) => sum + (getAmountFromTask(t) || 0), 0);

  const overdueCount = openTasks.filter(t => 
    getDueStatus(t.due_on) === 'overdue'
  ).length;

  if (!savedProjectId) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5 text-gold" />
            Accounts Payable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your Asana Accounts Payable project to view outstanding invoices.
            </p>
            <div className="space-y-2">
              <Label htmlFor="ap-project">Asana Project ID</Label>
              <div className="flex gap-2">
                <Input
                  id="ap-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="Enter your AP project GID"
                />
                <Button onClick={handleSaveProject} disabled={!projectId}>
                  Connect
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Find your project GID in the Asana URL (e.g., app.asana.com/0/<span className="font-mono">PROJECT_GID</span>/...)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5 text-gold" />
            Accounts Payable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5 text-gold" />
            Accounts Payable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-destructive">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4"
              onClick={() => {
                localStorage.removeItem('asana_ap_project_id');
                setSavedProjectId(null);
              }}
            >
              Reconfigure
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5 text-gold" />
            Accounts Payable
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchTasks(savedProjectId)}
          >
            Refresh
          </Button>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <div className="text-2xl font-bold text-gold">
            {formatCurrency(totalPayable)}
          </div>
          {overdueCount > 0 && (
            <Badge variant="destructive">
              {overdueCount} overdue
            </Badge>
          )}
          <Badge variant="secondary">
            {openTasks.length} items
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {openTasks.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No outstanding payables
            </p>
          ) : (
            openTasks.map((task) => {
              const amount = getAmountFromTask(task);
              const dueStatus = getDueStatus(task.due_on);
              
              return (
                <div
                  key={task.gid}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{task.name}</span>
                      <a 
                        href={task.permalink_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-gold"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    {task.due_on && (
                      <span className={`text-xs ${
                        dueStatus === 'overdue' ? 'text-destructive' :
                        dueStatus === 'due-today' ? 'text-warning' :
                        'text-muted-foreground'
                      }`}>
                        Due: {format(parseISO(task.due_on), 'MMM d, yyyy')}
                      </span>
                    )}
                  </div>
                  {amount && (
                    <div className="text-right font-semibold">
                      {formatCurrency(amount)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
};

interface InvoiceRow { id:string; vendor_name:string|null; property_address:string|null; invoice_amount:number|null; invoice_date:string|null; created_at:string; slack_posted_at:string|null; slack_error:string|null }

/** Accounts Payable from invoice submissions delivered to Slack #accounting. */
const AccountsPayable = ({ className }: AccountsPayableProps) => {
  const { orgId } = useTenant();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const load = async () => {
    if (!orgId) return;
    setLoading(true); setError(null);
    const { data, error: qErr } = await supabase.from('submissions')
      .select('id,vendor_name,property_address,invoice_amount,invoice_date,created_at,slack_posted_at,slack_error')
      .eq('org_id', orgId).eq('form_type', 'invoice')
      .order('created_at', { ascending: false }).limit(25);
    if (qErr) setError(qErr.message); else setRows((data ?? []) as InvoiceRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [orgId]);

  const send = async (id: string) => {
    setSending(id);
    const { data, error: fnErr } = await supabase.functions.invoke('slack-post-submission', { body: { action: 'post', submission_id: id } });
    setSending(null);
    if (fnErr || data?.ok === false || data?.error) toast.error(`Slack: ${fnErr?.message ?? data?.error ?? 'post failed'}`);
    else if (data?.skipped) toast.warning('No #accounting destination is configured.');
    else toast.success('Sent to #accounting');
    load();
  };

  const total = rows.reduce((sum, r) => sum + (Number(r.invoice_amount) || 0), 0);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5 text-gold" />
            Accounts Payable
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={load}>Refresh</Button>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <div className="text-2xl font-bold text-gold">{formatCurrency(total)}</div>
          <Badge variant="secondary">{rows.length} invoices</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
        ) : error ? (
          <div className="text-center py-4 text-destructive"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p>{error}</p></div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No invoice submissions yet</p>
            ) : rows.map((r) => {
              const status = invoiceSlackStatus(r);
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{r.vendor_name || r.property_address || 'Invoice'}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.invoice_date ? `Invoice ${format(parseISO(r.invoice_date), 'MMM d, yyyy')} · ` : ''}Submitted {format(parseISO(r.created_at), 'MMM d, yyyy')}
                    </span>
                    <div className="mt-1 flex items-center gap-2">
                      {status === 'posted' && <Badge variant="secondary">Posted to #accounting</Badge>}
                      {status === 'error' && <Badge variant="destructive" title={r.slack_error ?? ''}>Slack error</Badge>}
                      {status === 'not_posted' && <Badge variant="outline">Not posted</Badge>}
                      {canSendInvoiceToSlack(r) && (
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={sending === r.id} onClick={() => send(r.id)}>
                          {sending === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Send to #accounting'}
                        </Button>
                      )}
                    </div>
                  </div>
                  {r.invoice_amount != null && <div className="text-right font-semibold">{formatCurrency(Number(r.invoice_amount))}</div>}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AccountsPayable;

