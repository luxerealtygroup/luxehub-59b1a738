import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { blockPortalWrite, usePortalPreview } from '@/hooks/usePortalPreview';
import { CheckSquare, Clock, AlertCircle, Plus, Loader2, Check, Lock, EyeOff } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

import { PortalScope, scopePropertyId } from '@/lib/portalScope';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';

interface Task {
  id: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  due_date: string | null;
  property_id?: string | null;
  completed_at: string | null;
  status?: string | null;
  is_internal?: boolean;
}

interface ClientTaskListProps {
  clientAccountId: string;
  /** When true, shows an "Add task" button so agents can create tasks for the client. */
  canManage?: boolean;
  /** When provided, only tasks for this transaction are shown, and new tasks attach to it. */
  transactionId?: string | null;
  /** Property scope: 'all', 'general' (portal-wide only) or a property id. */
  scope?: PortalScope;
}

export function ClientTaskList({ clientAccountId, canManage = false, transactionId = null, scope = 'all' }: ClientTaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', due_date: '', notes: '', is_internal: false });
  const { toast } = useToast();
  const { isPreview } = usePortalPreview();
  // Internal tasks are blocked for clients by RLS; preview runs on the agent's
  // session, so filter them out here so the preview stays accurate.
  const showInternal = canManage && !isPreview;

  useEffect(() => {
    fetchTasks();
  }, [clientAccountId, transactionId, scope, showInternal]);

  const fetchTasks = async () => {
    let q = supabase
      .from('client_tasks')
      .select('*')
      .eq('client_account_id', clientAccountId);
    if (transactionId) q = q.eq('transaction_id', transactionId);
    if (scope === 'general') q = q.is('property_id', null);
    else if (scope !== 'all') q = q.eq('property_id', scope);
    if (!showInternal) q = q.eq('is_internal', false);
    const { data, error } = await q.order('due_date', { ascending: true, nullsFirst: false });

    if (!error) {
      setTasks(data || []);
    }
    setLoading(false);
  };

  const toggleInternal = async (task: Task) => {
    if (blockPortalWrite('Changing task visibility')) return;
    const next = !task.is_internal;
    const { error } = await supabase.from('client_tasks').update({ is_internal: next }).eq('id', task.id);
    if (error) {
      toast({ title: 'Could not change visibility', description: error.message, variant: 'destructive' });
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_internal: next } : t)));
    toast({ title: next ? 'Marked internal' : 'Now visible to client' });
  };


  const toggleTask = async (taskId: string, currentlyCompleted: boolean) => {
    if (blockPortalWrite('Completing tasks')) return;
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('client_tasks')
      .update({
        completed_at: currentlyCompleted ? null : nowIso,
        status: currentlyCompleted ? 'pending' : 'complete',
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
        ? { ...task, completed_at: currentlyCompleted ? null : nowIso, status: currentlyCompleted ? 'pending' : 'complete' }
        : task
    ));

    if (!currentlyCompleted) {
      toast({
        title: 'Task completed!',
        description: 'Great job checking that off your list.',
      });
    }
  };

  const createTask = async () => {
    if (blockPortalWrite('Creating tasks')) return;
    if (!form.title.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { data, error } = await supabase
      .from('client_tasks')
      .insert({
        client_account_id: clientAccountId,
        title: form.title.trim(),
        due_date: form.due_date || null,
        notes: form.notes.trim() || null,
        description: form.notes.trim() || null,
        status: 'pending',
        assigned_by: user.id,
        transaction_id: transactionId,
        property_id: scopePropertyId(scope),
        is_internal: form.is_internal,
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast({ title: 'Could not create task', description: error.message, variant: 'destructive' });
      return;
    }
    setTasks([data as Task, ...tasks]);
    setForm({ title: '', due_date: '', notes: '', is_internal: false });

    setDialogOpen(false);
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
      <Card className="luxe-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 font-display font-semibold tracking-tight">
            <CheckSquare className="h-5 w-5 text-primary" />
            Your Tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 bg-muted rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="luxe-card">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <CheckSquare className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="eyebrow leading-none">Checklist</p>
            <CardTitle className="font-display text-lg font-semibold tracking-tight mt-1">
              {canManage ? 'Client Tasks' : 'Your Tasks'}
            </CardTitle>
          </div>
          {pendingTasks.length > 0 && (
            <span className="chip-gold">{pendingTasks.length} pending</span>
          )}
          {canManage && !isPreview && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="ml-1 gap-1 rounded-full">
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create task for client</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1">
                    <Label htmlFor="task-title">Title</Label>
                    <Input id="task-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Sign inspection waiver" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="task-due">Due date</Label>
                    <Input id="task-due" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="task-notes">Notes (optional)</Label>
                    <Textarea id="task-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
                    <Label htmlFor="task-internal" className="text-sm cursor-pointer flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5" /> Internal (agent-only)
                    </Label>
                    <Switch id="task-internal" checked={form.is_internal} onCheckedChange={(v) => setForm({ ...form, is_internal: v })} />
                  </div>
                </div>

                <DialogFooter>
                  <Button onClick={createTask} disabled={saving || !form.title.trim()}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create task
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="text-center py-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-3">
              <Check className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {canManage ? 'No tasks yet. Create one to guide your client through next steps.' : "You're all caught up — your agent will add tasks here when needed."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pending Tasks */}
            {pendingTasks.length > 0 && (
              <div className="space-y-2.5">
                {pendingTasks.map(task => {
                  const status = getDueDateStatus(task.due_date, false);
                  return (
                    <div 
                      key={task.id} 
                      className={`group flex items-start gap-3 p-3.5 rounded-xl border transition-all duration-200 ${
                        task.is_internal
                          ? 'border-dashed border-amber-500/50 bg-muted/50'
                          : status === 'overdue'
                          ? 'border-destructive/40 bg-destructive/5 hover:border-destructive/60' 
                          : status === 'today'
                          ? 'border-primary/50 bg-primary/5 hover:border-primary/70'
                          : 'border-border/70 bg-background hover:border-primary/30 hover:shadow-sm'
                      }`}
                    >
                      <Checkbox
                        checked={false}
                        disabled={isPreview}
                        onCheckedChange={() => toggleTask(task.id, false)}
                        className="mt-1 h-5 w-5 rounded-md border-2 border-muted-foreground/40 data-[state=checked]:border-primary data-[state=checked]:bg-primary transition-all"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`font-medium leading-snug ${task.is_internal ? 'text-muted-foreground' : ''}`}>{task.title}</p>
                          {showInternal && (
                            <div className="flex items-center gap-1 shrink-0">
                              {task.is_internal && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                  <Lock className="h-3 w-3" /> Internal
                                </span>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-full"
                                title={task.is_internal ? 'Make visible to client' : 'Mark internal (agent-only)'}
                                onClick={() => toggleInternal(task)}
                              >
                                {task.is_internal ? <EyeOff className="h-3.5 w-3.5 text-amber-600" /> : <Lock className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          )}
                        </div>
                        {(task.notes || task.description) && (
                          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap leading-relaxed">
                            {task.notes || task.description}
                          </p>
                        )}
                        {task.due_date && (
                          <div className="mt-2">
                            {status === 'overdue' ? (
                              <span className="chip-danger">
                                <AlertCircle className="h-3 w-3" />
                                Overdue · {format(new Date(task.due_date), 'MMM d')}
                              </span>
                            ) : status === 'today' ? (
                              <span className="chip-gold">
                                <Clock className="h-3 w-3" /> Due today
                              </span>
                            ) : (
                              <span className="chip-muted">
                                <Clock className="h-3 w-3" />
                                Due {format(new Date(task.due_date), 'MMM d')}
                              </span>
                            )}
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
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2">
                  <p className="eyebrow">Completed</p>
                  <div className="flex-1 h-px bg-border/60" />
                </div>
                {completedTasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04]"
                  >
                    <Checkbox
                      checked={true}
                      disabled={isPreview}
                      onCheckedChange={() => toggleTask(task.id, true)}
                      className="mt-1 h-5 w-5 rounded-md border-2 border-emerald-500 bg-emerald-500 data-[state=checked]:bg-emerald-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-muted-foreground line-through leading-snug">
                        {task.title}
                      </p>
                      {task.completed_at && (
                        <p className="text-xs text-emerald-700 mt-1">
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
