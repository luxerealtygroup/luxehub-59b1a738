import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckSquare, Clock, AlertCircle } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed_at: string | null;
}

interface ClientTaskListProps {
  clientAccountId: string;
}

export function ClientTaskList({ clientAccountId }: ClientTaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchTasks();
  }, [clientAccountId]);

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from('client_tasks')
      .select('*')
      .eq('client_account_id', clientAccountId)
      .order('due_date', { ascending: true, nullsFirst: false });

    if (!error) {
      setTasks(data || []);
    }
    setLoading(false);
  };

  const toggleTask = async (taskId: string, currentlyCompleted: boolean) => {
    const { error } = await supabase
      .from('client_tasks')
      .update({ 
        completed_at: currentlyCompleted ? null : new Date().toISOString() 
      })
      .eq('id', taskId);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update task',
        variant: 'destructive'
      });
      return;
    }

    setTasks(tasks.map(task => 
      task.id === taskId 
        ? { ...task, completed_at: currentlyCompleted ? null : new Date().toISOString() }
        : task
    ));

    if (!currentlyCompleted) {
      toast({
        title: 'Task completed!',
        description: 'Great job checking that off your list.',
      });
    }
  };

  const getDueDateStatus = (dueDate: string | null, isCompleted: boolean) => {
    if (isCompleted || !dueDate) return null;
    const date = new Date(dueDate);
    if (isPast(date) && !isToday(date)) return 'overdue';
    if (isToday(date)) return 'today';
    return 'upcoming';
  };

  const pendingTasks = tasks.filter(t => !t.completed_at);
  const completedTasks = tasks.filter(t => t.completed_at);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-primary" />
            Your Tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CheckSquare className="h-5 w-5 text-primary" />
          Your Tasks
          {pendingTasks.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {pendingTasks.length} pending
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No tasks assigned yet. Your agent will add tasks here when needed.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Pending Tasks */}
            {pendingTasks.length > 0 && (
              <div className="space-y-2">
                {pendingTasks.map(task => {
                  const status = getDueDateStatus(task.due_date, false);
                  return (
                    <div 
                      key={task.id} 
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        status === 'overdue' 
                          ? 'border-destructive/50 bg-destructive/5' 
                          : status === 'today'
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={false}
                        onCheckedChange={() => toggleTask(task.id, false)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{task.title}</p>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">{task.description}</p>
                        )}
                        {task.due_date && (
                          <div className="flex items-center gap-1 mt-1">
                            {status === 'overdue' ? (
                              <AlertCircle className="h-3 w-3 text-destructive" />
                            ) : (
                              <Clock className="h-3 w-3 text-muted-foreground" />
                            )}
                            <span className={`text-xs ${status === 'overdue' ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                              {status === 'overdue' && 'Overdue: '}
                              {status === 'today' && 'Due today'}
                              {status === 'upcoming' && `Due ${format(new Date(task.due_date), 'MMM d')}`}
                              {status === 'overdue' && format(new Date(task.due_date), 'MMM d')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Completed Tasks */}
            {completedTasks.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground font-medium">Completed</p>
                {completedTasks.map(task => (
                  <div 
                    key={task.id} 
                    className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30"
                  >
                    <Checkbox
                      checked={true}
                      onCheckedChange={() => toggleTask(task.id, true)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-muted-foreground line-through">{task.title}</p>
                      {task.completed_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Completed {format(new Date(task.completed_at), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
