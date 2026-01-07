import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, Receipt, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format, parseISO, isPast, isToday } from 'date-fns';

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

const AccountsPayable = ({ className }: AccountsPayableProps) => {
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
    // Try to find an amount field in custom fields
    const amountField = task.custom_fields?.find(cf => 
      cf.name.toLowerCase().includes('amount') || 
      cf.name.toLowerCase().includes('total') ||
      cf.name.toLowerCase().includes('invoice')
    );
    if (amountField?.number_value) return amountField.number_value;
    
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
            ${totalPayable.toLocaleString()}
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
                      ${amount.toLocaleString()}
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

export default AccountsPayable;
