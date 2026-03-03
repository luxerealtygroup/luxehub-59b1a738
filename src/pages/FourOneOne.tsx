import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Save, Target, Trophy, TrendingUp, FileText, ArrowRight, Plus, Trash2, CalendarDays } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, startOfWeek, addWeeks, subWeeks } from 'date-fns';
import { FUBContactTypeahead } from '@/components/FUBContactTypeahead';
import { formatCurrency } from '@/lib/utils';
import { useHasFUB } from '@/hooks/useHasFUB';

interface Weekly411 {
  id?: string;
  week_start_date: string;
  calls_goal: number;
  calls_actual: number;
  appointments_goal: number;
  appointments_actual: number;
  listings_goal: number;
  listings_actual: number;
  contracts_goal: number;
  contracts_actual: number;
  contacts_made: number;
  dials: number;
  doors_knocked: number;
  appointments_set: number;
  appointments_held: number;
  pipeline_additions: number;
  contracts_signed: number;
  firm_deals: number;
  database_size: number;
  priority_1: string;
  priority_1_completed: boolean;
  priority_2: string;
  priority_2_completed: boolean;
  priority_3: string;
  priority_3_completed: boolean;
  priority_4: string;
  priority_4_completed: boolean;
  personal_priority_1: string;
  personal_priority_1_completed: boolean;
  personal_priority_2: string;
  personal_priority_2_completed: boolean;
  personal_priority_3: string;
  personal_priority_3_completed: boolean;
  wins: string;
  challenges: string;
  next_steps: string;
  notes: string;
}

interface AppointmentRecord {
  id?: string;
  fub_contact_id: number | null;
  contact_name: string;
  appointment_date: string;
  appointment_type: string;
  outcome: string;
  notes: string;
}

interface ProductionGoals {
  id?: string;
  year: number;
  annual_units_goal: number;
  annual_gci_goal: number;
  annual_volume_goal: number;
  annual_focus: string;
  monthly_goals: { 
    month: number; 
    focus: string; 
    target: string;
    line_3?: string;
    line_4?: string;
    line_5?: string;
    line_6?: string;
    line_7?: string;
    personal_focus?: string;
    personal_target?: string;
    personal_line_3?: string;
    personal_line_4?: string;
    personal_line_5?: string;
    personal_line_6?: string;
    personal_line_7?: string;
  }[];
}

interface SyncedGoals {
  deals_goal: number;
  gci_goal: number;
  monthly_deals: number[];
  monthly_gci: number[];
  fallout_rate: number;
  pipeline_by_month: number[];
}

const emptyWeekly: Weekly411 = {
  week_start_date: '',
  calls_goal: 50,
  calls_actual: 0,
  appointments_goal: 10,
  appointments_actual: 0,
  listings_goal: 2,
  listings_actual: 0,
  contracts_goal: 2,
  contracts_actual: 0,
  contacts_made: 0,
  dials: 0,
  doors_knocked: 0,
  appointments_set: 0,
  appointments_held: 0,
  pipeline_additions: 0,
  contracts_signed: 0,
  firm_deals: 0,
  database_size: 0,
  priority_1: '',
  priority_1_completed: false,
  priority_2: '',
  priority_2_completed: false,
  priority_3: '',
  priority_3_completed: false,
  priority_4: '',
  priority_4_completed: false,
  personal_priority_1: '',
  personal_priority_1_completed: false,
  personal_priority_2: '',
  personal_priority_2_completed: false,
  personal_priority_3: '',
  personal_priority_3_completed: false,
  wins: '',
  challenges: '',
  next_steps: '',
  notes: '',
};

const FourOneOne = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { hasFUB } = useHasFUB();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [weeklyData, setWeeklyData] = useState<Weekly411>({ ...emptyWeekly });
  const [appointmentRecords, setAppointmentRecords] = useState<AppointmentRecord[]>([]);
  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false);
  const [newAppointment, setNewAppointment] = useState<AppointmentRecord>({
    fub_contact_id: null,
    contact_name: '',
    appointment_date: format(new Date(), 'yyyy-MM-dd'),
    appointment_type: 'buyer',
    outcome: '',
    notes: '',
  });
  const [annualGoals, setAnnualGoals] = useState<ProductionGoals>({
    year: 2026,
    annual_units_goal: 24,
    annual_gci_goal: 150000,
    annual_volume_goal: 5000000,
    annual_focus: '',
    monthly_goals: [],
  });
  const [syncedGoals, setSyncedGoals] = useState<SyncedGoals>({
    deals_goal: 0,
    gci_goal: 0,
    monthly_deals: Array(12).fill(0),
    monthly_gci: Array(12).fill(0),
    fallout_rate: 50,
    pipeline_by_month: Array(12).fill(0),
  });

  const currentYear = 2026;
  const currentMonth = new Date().getMonth();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekMonth = currentWeek.getMonth();

  const fetchAppointmentRecords = useCallback(async () => {
    if (!user) return;
    const weekStart = format(currentWeek, 'yyyy-MM-dd');
    const { data } = await supabase
      .from('appointment_records')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_start_date', weekStart)
      .order('appointment_date', { ascending: true });
    
    setAppointmentRecords((data || []).map(d => ({
      id: d.id,
      fub_contact_id: d.fub_contact_id,
      contact_name: d.contact_name,
      appointment_date: d.appointment_date,
      appointment_type: d.appointment_type,
      outcome: d.outcome || '',
      notes: d.notes || '',
    })));
  }, [user, currentWeek]);

  const fetchWeeklyData = async () => {
    if (!user) return;
    const weekStart = format(currentWeek, 'yyyy-MM-dd');
    
    const { data } = await supabase
      .from('weekly_411')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_start_date', weekStart)
      .maybeSingle();

    if (data) {
      setWeeklyData(data as unknown as Weekly411);
    } else {
      setWeeklyData({ ...emptyWeekly, week_start_date: weekStart });
    }
  };

  const fetchSyncedGoals = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('agent_goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('period', 'yearly')
      .in('goal_type', ['deals_closed', 'revenue']);
    
    const { data: pipelineClients } = await supabase
      .from('pipeline_clients')
      .select('expected_pending_date')
      .eq('user_id', user.id);
    
    const pipelineByMonth = Array(12).fill(0);
    pipelineClients?.forEach(c => {
      if (c.expected_pending_date) {
        const date = new Date(c.expected_pending_date);
        if (date.getFullYear() === currentYear) {
          pipelineByMonth[date.getMonth()]++;
        }
      }
    });
    
    const dealsGoal = data?.find(g => g.goal_type === 'deals_closed');
    const gciGoal = data?.find(g => g.goal_type === 'revenue');
    
    const dealsValue = dealsGoal?.target_value || 0;
    const gciValue = gciGoal?.target_value || 0;
    
    const savedCalcValues = localStorage.getItem(`goalCalcValues_${user.id}_${currentYear}`);
    const falloutRate = savedCalcValues ? JSON.parse(savedCalcValues).fallout_rate ?? 50 : 50;
    
    const savedMonthlyGoals = localStorage.getItem(`monthlyGoals_${user.id}_${currentYear}`);
    let monthlyDeals = Array(12).fill(dealsValue / 12);
    let monthlyGci = Array(12).fill(gciValue / 12);
    
    if (savedMonthlyGoals) {
      const parsed = JSON.parse(savedMonthlyGoals);
      monthlyDeals = parsed.map((m: { deals: number }) => m.deals || 0);
      monthlyGci = parsed.map((m: { gci: number }) => m.gci || 0);
    }
    
    setSyncedGoals({
      deals_goal: dealsValue,
      gci_goal: gciValue,
      monthly_deals: monthlyDeals,
      monthly_gci: monthlyGci,
      fallout_rate: falloutRate,
      pipeline_by_month: pipelineByMonth,
    });
  };

  const fetchAnnualGoals = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('production_goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('year', currentYear)
      .maybeSingle();

    if (data) {
      setAnnualGoals({
        ...data,
        monthly_goals: (data.monthly_goals as { month: number; focus: string; target: string }[]) || [],
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchWeeklyData();
    fetchAnnualGoals();
    fetchSyncedGoals();
    fetchAppointmentRecords();
  }, [user, currentWeek]);

  // Auto-update appointments_held count from structured records
  useEffect(() => {
    setWeeklyData(prev => ({ ...prev, appointments_held: appointmentRecords.length }));
  }, [appointmentRecords]);

  const saveWeeklyData = async () => {
    if (!user) return;
    setSaving(true);

    const weekStart = format(currentWeek, 'yyyy-MM-dd');
    const payload = {
      ...weeklyData,
      user_id: user.id,
      week_start_date: weekStart,
      appointments_held: appointmentRecords.length,
    };

    const { error } = weeklyData.id
      ? await supabase.from('weekly_411').update(payload).eq('id', weeklyData.id)
      : await supabase.from('weekly_411').insert(payload);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved!', description: 'Your 4-1-1 has been updated' });
      fetchWeeklyData();
    }
    setSaving(false);
  };

  const addAppointmentRecord = async () => {
    if (!user || !newAppointment.contact_name || !newAppointment.outcome || !newAppointment.appointment_type) return;
    if (hasFUB && !newAppointment.fub_contact_id) return;
    const weekStart = format(currentWeek, 'yyyy-MM-dd');

    const { error } = await supabase.from('appointment_records').insert({
      user_id: user.id,
      week_start_date: weekStart,
      weekly_411_id: weeklyData.id || null,
      fub_contact_id: newAppointment.fub_contact_id,
      contact_name: newAppointment.contact_name,
      appointment_date: newAppointment.appointment_date,
      appointment_type: newAppointment.appointment_type,
      outcome: newAppointment.outcome || null,
      notes: newAppointment.notes || null,
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Appointment Logged', description: `${newAppointment.contact_name} added` });
      setNewAppointment({
        fub_contact_id: null,
        contact_name: '',
        appointment_date: format(new Date(), 'yyyy-MM-dd'),
        appointment_type: 'buyer',
        outcome: '',
        notes: '',
      });
      setShowAppointmentDialog(false);
      fetchAppointmentRecords();
    }
  };

  const deleteAppointmentRecord = async (id: string) => {
    const { error } = await supabase.from('appointment_records').delete().eq('id', id);
    if (!error) {
      fetchAppointmentRecords();
      toast({ title: 'Removed', description: 'Appointment record deleted' });
    }
  };

  const handleFUBContactSelect = (contact: { id: number; name: string; email?: string; phone?: string }) => {
    setNewAppointment(prev => ({
      ...prev,
      contact_name: contact.name,
      fub_contact_id: contact.id,
    }));
  };

  const clearFUBContact = () => {
    setNewAppointment(prev => ({
      ...prev,
      contact_name: '',
      fub_contact_id: null,
    }));
  };

  const saveAnnualGoals = async () => {
    if (!user) return;
    setSaving(true);

    const payload = {
      ...annualGoals,
      user_id: user.id,
    };

    const { error } = annualGoals.id
      ? await supabase.from('production_goals').update(payload).eq('id', annualGoals.id)
      : await supabase.from('production_goals').insert(payload);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved!', description: 'Annual goals updated' });
      fetchAnnualGoals();
    }
    setSaving(false);
  };

  const getMonthlyGoal = (month: number) => {
    return annualGoals.monthly_goals.find(g => g.month === month) || { 
      month, 
      focus: '', 
      target: '',
      line_3: '',
      line_4: '',
      line_5: '',
      line_6: '',
      line_7: '',
      personal_focus: '',
      personal_target: '',
      personal_line_3: '',
      personal_line_4: '',
      personal_line_5: '',
      personal_line_6: '',
      personal_line_7: '',
    };
  };

  const businessLineKeys = ['focus', 'target', 'line_3', 'line_4', 'line_5', 'line_6', 'line_7'] as const;
  const personalLineKeys = ['personal_focus', 'personal_target', 'personal_line_3', 'personal_line_4', 'personal_line_5', 'personal_line_6', 'personal_line_7'] as const;

  const updateMonthlyGoal = (month: number, field: string, value: string) => {
    const updated = [...annualGoals.monthly_goals];
    const idx = updated.findIndex(g => g.month === month);
    if (idx >= 0) {
      updated[idx] = { ...updated[idx], [field]: value };
    } else {
      const newGoal: any = { month, focus: '', target: '', personal_focus: '', personal_target: '' };
      newGoal[field] = value;
      updated.push(newGoal);
    }
    setAnnualGoals({ ...annualGoals, monthly_goals: updated });
  };

  const calcProgress = (actual: number, goal: number) => goal > 0 ? Math.min(100, (actual / goal) * 100) : 0;

  const carryForwardPriority = async (type: 'business' | 'personal', num: number, text: string) => {
    if (!user) return;
    
    const nextWeekStart = format(addWeeks(currentWeek, 1), 'yyyy-MM-dd');
    const cleanText = text.replace(/^\[Carried\] /, '');
    const carriedText = `[Carried] ${cleanText}`;
    
    const { data: nextWeekData } = await supabase
      .from('weekly_411')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_start_date', nextWeekStart)
      .maybeSingle();

    const priorityField = type === 'business' ? `priority_${num}` : `personal_priority_${num}`;
    const completedField = `${priorityField}_completed`;

    if (nextWeekData) {
      await supabase
        .from('weekly_411')
        .update({ [priorityField]: carriedText, [completedField]: false })
        .eq('id', nextWeekData.id);
    } else {
      await supabase
        .from('weekly_411')
        .insert({
          user_id: user.id,
          week_start_date: nextWeekStart,
          [priorityField]: carriedText,
          [completedField]: false,
        });
    }

    toast({
      title: '📋 Carried Forward',
      description: `Priority moved to next week. Stay focused!`,
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-primary animate-pulse">Loading 4-1-1...</div>;
  }

  const outcomeColors: Record<string, string> = {
    'Signed': 'bg-green-500/10 text-green-600 border-green-500/30',
    'Follow up': 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    'No show': 'bg-red-500/10 text-red-600 border-red-500/30',
    'Not moving forward': 'bg-muted text-muted-foreground border-border',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">4-1-1 Tracker</h1>
          <p className="text-muted-foreground mt-1">Weekly accountability & goal tracking</p>
        </div>
      </div>

      {/* Goals Summary from Goals Page */}
      {syncedGoals.deals_goal > 0 && (() => {
        const conversionRate = (100 - syncedGoals.fallout_rate) / 100;
        const getPipelineNeeded = (deals: number) => conversionRate > 0 ? Math.ceil(deals / conversionRate) : 0;
        const monthlyPipelineNeeded = getPipelineNeeded(syncedGoals.monthly_deals[weekMonth]);
        const monthlyPipelineCurrent = syncedGoals.pipeline_by_month[weekMonth];
        const isOnTrack = monthlyPipelineCurrent >= monthlyPipelineNeeded;
        
        return (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Annual Deals Goal</p>
                  <p className="text-2xl font-bold text-primary">{syncedGoals.deals_goal}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Annual GCI Goal</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(syncedGoals.gci_goal)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{monthNames[weekMonth]} Deals</p>
                  <p className="text-2xl font-bold text-foreground">{Math.round(syncedGoals.monthly_deals[weekMonth] * 10) / 10}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{monthNames[weekMonth]} GCI</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(Math.round(syncedGoals.monthly_gci[weekMonth]))}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{monthNames[weekMonth]} Pipeline</p>
                  <p className={`text-2xl font-bold ${isOnTrack ? 'text-green-500' : 'text-amber-500'}`}>
                    {monthlyPipelineCurrent}/{monthlyPipelineNeeded}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isOnTrack ? 'On track' : `Need ${monthlyPipelineNeeded - monthlyPipelineCurrent} more`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Tabs defaultValue="weekly" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="weekly" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Target className="h-4 w-4 mr-2" /> Weekly
          </TabsTrigger>
          <TabsTrigger value="monthly" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <TrendingUp className="h-4 w-4 mr-2" /> Monthly
          </TabsTrigger>
          <TabsTrigger value="annual" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Trophy className="h-4 w-4 mr-2" /> Annual
          </TabsTrigger>
        </TabsList>

        {/* WEEKLY TAB */}
        <TabsContent value="weekly" className="space-y-6">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <div className="text-center">
              <h2 className="font-display text-lg font-semibold">
                Week of {format(currentWeek, 'MMM d, yyyy')}
              </h2>
              {syncedGoals.deals_goal > 0 && (() => {
                const conversionRate = (100 - syncedGoals.fallout_rate) / 100;
                const pipelineNeeded = conversionRate > 0 ? Math.ceil(syncedGoals.monthly_deals[weekMonth] / conversionRate) : 0;
                const pipelineCurrent = syncedGoals.pipeline_by_month[weekMonth];
                return (
                  <p className="text-sm text-muted-foreground">
                    {monthNames[weekMonth]}: {Math.round(syncedGoals.monthly_deals[weekMonth] * 10) / 10} deals • {formatCurrency(Math.round(syncedGoals.monthly_gci[weekMonth]))} GCI • Pipeline: {pipelineCurrent}/{pipelineNeeded}
                  </p>
                );
              })()}
            </div>
            <Button variant="outline" size="sm" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {/* Activity Metrics - New fields */}
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle className="text-lg font-display">Weekly Activity Tracking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Contacts Made', key: 'contacts_made' },
                  { label: 'Dials', key: 'dials' },
                  { label: 'Doors Knocked', key: 'doors_knocked' },
                  { label: 'Appointments Set', key: 'appointments_set' },
                  { label: 'Pipeline Additions', key: 'pipeline_additions' },
                  { label: 'Contracts Signed', key: 'contracts_signed' },
                  { label: 'Firm Deals', key: 'firm_deals' },
                  { label: 'Database Size', key: 'database_size' },
                ].map((field) => (
                  <div key={field.key} className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">{field.label}</Label>
                    <Input
                      type="number"
                      value={(weeklyData as any)[field.key] || 0}
                      onChange={(e) => setWeeklyData({ ...weeklyData, [field.key]: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                ))}
                {/* Appointments Held - auto-calculated */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">Appointments Held</Label>
                  <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3 text-sm font-semibold">
                    {appointmentRecords.length}
                  </div>
                  <p className="text-xs text-muted-foreground">Auto-calculated</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Legacy Activity Metrics with Goals */}
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle className="text-lg font-display">Goal Tracking (Actual vs Goal)</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Calls', goal: 'calls_goal', actual: 'calls_actual' },
                { label: 'Appointments', goal: 'appointments_goal', actual: 'appointments_actual' },
                { label: 'Listings', goal: 'listings_goal', actual: 'listings_actual' },
                { label: 'Contracts', goal: 'contracts_goal', actual: 'contracts_actual' },
              ].map((metric) => (
                <div key={metric.label} className="space-y-2">
                  <Label className="text-sm font-medium">{metric.label}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Actual"
                      value={weeklyData[metric.actual as keyof Weekly411] as number}
                      onChange={(e) => setWeeklyData({ ...weeklyData, [metric.actual]: parseInt(e.target.value) || 0 })}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="Goal"
                      value={weeklyData[metric.goal as keyof Weekly411] as number}
                      onChange={(e) => setWeeklyData({ ...weeklyData, [metric.goal]: parseInt(e.target.value) || 0 })}
                      className="w-20 text-muted-foreground"
                    />
                  </div>
                  <Progress 
                    value={calcProgress(
                      weeklyData[metric.actual as keyof Weekly411] as number,
                      weeklyData[metric.goal as keyof Weekly411] as number
                    )} 
                    className="h-2"
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Structured Appointment Records */}
          <Card className="border-primary/10">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <CalendarDays className="h-5 w-5" /> Appointments Held ({appointmentRecords.length})
              </CardTitle>
              <Dialog open={showAppointmentDialog} onOpenChange={setShowAppointmentDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-primary text-primary-foreground">
                    <Plus className="h-4 w-4 mr-1" /> Log Appointment
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Log Appointment Held</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    {hasFUB ? (
                      <div className="space-y-2">
                        <Label>Contact (Follow Up Boss) <span className="text-destructive">*</span></Label>
                        <FUBContactTypeahead
                          selectedContact={newAppointment.fub_contact_id ? {
                            id: newAppointment.fub_contact_id,
                            name: newAppointment.contact_name,
                          } : null}
                          onSelect={handleFUBContactSelect}
                          onClear={clearFUBContact}
                        />
                        {!newAppointment.fub_contact_id && (
                          <p className="text-xs text-muted-foreground">Search and select a contact from Follow Up Boss</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>Contact Name <span className="text-destructive">*</span></Label>
                        <Input
                          placeholder="Enter contact name"
                          value={newAppointment.contact_name}
                          onChange={(e) => setNewAppointment(prev => ({ ...prev, contact_name: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">Manual Entry (No FUB ID)</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Appointment Date <span className="text-destructive">*</span></Label>
                      <Input
                        type="date"
                        value={newAppointment.appointment_date}
                        onChange={(e) => setNewAppointment(prev => ({ ...prev, appointment_date: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Appointment Type <span className="text-destructive">*</span></Label>
                      <Select
                        value={newAppointment.appointment_type}
                        onValueChange={(val) => setNewAppointment(prev => ({ ...prev, appointment_type: val }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="buyer">Buyer</SelectItem>
                          <SelectItem value="seller">Seller</SelectItem>
                          <SelectItem value="tenant">Tenant</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Outcome <span className="text-destructive">*</span></Label>
                      <Select
                        value={newAppointment.outcome}
                        onValueChange={(val) => setNewAppointment(prev => ({ ...prev, outcome: val }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select outcome" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Held">Held</SelectItem>
                          <SelectItem value="No show">No show</SelectItem>
                          <SelectItem value="Follow up">Follow up</SelectItem>
                          <SelectItem value="Signed">Signed</SelectItem>
                          <SelectItem value="Not moving forward">Not moving forward</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes (optional)</Label>
                      <Textarea
                        placeholder="Additional notes..."
                        value={newAppointment.notes}
                        onChange={(e) => setNewAppointment(prev => ({ ...prev, notes: e.target.value }))}
                        rows={2}
                      />
                    </div>
                    <Button
                      onClick={addAppointmentRecord}
                      disabled={(!hasFUB ? !newAppointment.contact_name : !newAppointment.fub_contact_id) || !newAppointment.outcome || !newAppointment.appointment_date}
                      className="w-full bg-primary text-primary-foreground"
                    >
                      <Plus className="h-4 w-4 mr-2" /> Add Appointment
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {appointmentRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No appointments logged yet. Click "Log Appointment" to add one.
                </p>
              ) : (
                <div className="space-y-2">
                  {appointmentRecords.map((appt) => (
                    <div key={appt.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{appt.contact_name}</span>
                          {appt.fub_contact_id ? (
                            <Badge variant="outline" className="text-xs">FUB #{appt.fub_contact_id}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-600">Manual Entry</Badge>
                          )}
                          <Badge variant="outline" className="text-xs capitalize">{appt.appointment_type}</Badge>
                          {appt.outcome && (
                            <Badge variant="outline" className={`text-xs ${outcomeColors[appt.outcome] || ''}`}>
                              {appt.outcome}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {appt.appointment_date}
                          {appt.notes && ` • ${appt.notes}`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => appt.id && deleteAppointmentRecord(appt.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Business Priorities */}
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle className="text-lg font-display">4 Business Priorities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3, 4].map((num) => {
                const priorityText = weeklyData[`priority_${num}` as keyof Weekly411] as string || '';
                const isCompleted = weeklyData[`priority_${num}_completed` as keyof Weekly411] as boolean;
                const isCarriedOver = priorityText.startsWith('[Carried] ');
                return (
                  <div key={num} className="flex items-center gap-3">
                    <Checkbox
                      checked={isCompleted}
                      onCheckedChange={(checked) => {
                        setWeeklyData({ ...weeklyData, [`priority_${num}_completed`]: checked });
                        if (checked) {
                          toast({ 
                            title: '🎉 Great job!', 
                            description: 'You completed a business priority! Keep up the momentum!' 
                          });
                        }
                      }}
                    />
                    <div className="flex-1 relative">
                      <Input
                        placeholder={`Business Priority ${num}`}
                        value={priorityText}
                        onChange={(e) => setWeeklyData({ ...weeklyData, [`priority_${num}`]: e.target.value })}
                        className={`${isCompleted ? 'line-through text-muted-foreground' : ''} ${isCarriedOver ? 'border-amber-500/50 bg-amber-500/5' : ''}`}
                      />
                      {isCarriedOver && (
                        <span className="absolute -top-2 right-2 text-xs bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded">
                          Carried
                        </span>
                      )}
                    </div>
                    {!isCompleted && priorityText && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => carryForwardPriority('business', num, priorityText)}
                        className="text-muted-foreground hover:text-amber-600 px-2"
                        title="Carry forward to next week"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Personal Priorities */}
          <Card className="border-green-500/20">
            <CardHeader>
              <CardTitle className="text-lg font-display text-green-500">3 Personal Priorities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3].map((num) => {
                const priorityText = weeklyData[`personal_priority_${num}` as keyof Weekly411] as string || '';
                const isCompleted = weeklyData[`personal_priority_${num}_completed` as keyof Weekly411] as boolean;
                const isCarriedOver = priorityText.startsWith('[Carried] ');
                return (
                  <div key={num} className="flex items-center gap-3">
                    <Checkbox
                      checked={isCompleted}
                      onCheckedChange={(checked) => {
                        setWeeklyData({ ...weeklyData, [`personal_priority_${num}_completed`]: checked });
                        if (checked) {
                          toast({ 
                            title: '🌟 Awesome!', 
                            description: 'Personal priority completed! You\'re crushing it!' 
                          });
                        }
                      }}
                      className="border-green-500/50 data-[state=checked]:bg-green-500"
                    />
                    <div className="flex-1 relative">
                      <Input
                        placeholder={`Personal Priority ${num}`}
                        value={priorityText}
                        onChange={(e) => setWeeklyData({ ...weeklyData, [`personal_priority_${num}`]: e.target.value })}
                        className={`${isCompleted ? 'line-through text-muted-foreground' : 'border-green-500/20 focus:border-green-500'} ${isCarriedOver ? 'border-amber-500/50 bg-amber-500/5' : ''}`}
                      />
                      {isCarriedOver && (
                        <span className="absolute -top-2 right-2 text-xs bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded">
                          Carried
                        </span>
                      )}
                    </div>
                    {!isCompleted && priorityText && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => carryForwardPriority('personal', num, priorityText)}
                        className="text-muted-foreground hover:text-amber-600 px-2"
                        title="Carry forward to next week"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Accountability Notes */}
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <FileText className="h-5 w-5" /> Accountability Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Wins This Week</Label>
                <Textarea
                  placeholder="What went well?"
                  value={weeklyData.wins || ''}
                  onChange={(e) => setWeeklyData({ ...weeklyData, wins: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Challenges</Label>
                <Textarea
                  placeholder="What obstacles did you face?"
                  value={weeklyData.challenges || ''}
                  onChange={(e) => setWeeklyData({ ...weeklyData, challenges: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Next Steps</Label>
                <Textarea
                  placeholder="What will you do next week?"
                  value={weeklyData.next_steps || ''}
                  onChange={(e) => setWeeklyData({ ...weeklyData, next_steps: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Additional Notes</Label>
                <Textarea
                  placeholder="Anything else?"
                  value={weeklyData.notes || ''}
                  onChange={(e) => setWeeklyData({ ...weeklyData, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Button onClick={saveWeeklyData} disabled={saving} className="w-full bg-primary text-primary-foreground">
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Weekly 4-1-1'}
          </Button>
        </TabsContent>

        {/* MONTHLY TAB */}
        <TabsContent value="monthly" className="space-y-6">
          {/* Business Monthly Goals */}
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" /> Business Goals (2026)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {monthNames.map((name, idx) => {
                const goal = getMonthlyGoal(idx);
                const isCurrentMonth = idx === currentMonth;
                return (
                  <div 
                    key={name} 
                    className={`p-3 rounded-lg border ${isCurrentMonth ? 'border-primary bg-primary/5' : 'border-border'}`}
                  >
                    <p className={`font-medium text-sm mb-2 ${isCurrentMonth ? 'text-primary' : ''}`}>
                      {name} {isCurrentMonth && '(Current)'}
                    </p>
                    {businessLineKeys.map((key, lineIdx) => (
                      <Input
                        key={key}
                        placeholder={lineIdx === 0 ? 'Business Focus' : lineIdx === 1 ? 'Target (e.g., 2 closings)' : `Goal ${lineIdx + 1}`}
                        value={(goal as any)[key] || ''}
                        onChange={(e) => updateMonthlyGoal(idx, key, e.target.value)}
                        className={`text-sm ${lineIdx < 6 ? 'mb-1.5' : ''}`}
                      />
                    ))}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Personal Monthly Goals */}
          <Card className="border-green-500/20">
            <CardHeader>
              <CardTitle className="text-lg font-display flex items-center gap-2 text-green-600">
                <Trophy className="h-5 w-5" /> Personal Goals (2026)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {monthNames.map((name, idx) => {
                const goal = getMonthlyGoal(idx);
                const isCurrentMonth = idx === currentMonth;
                return (
                  <div 
                    key={name} 
                    className={`p-3 rounded-lg border ${isCurrentMonth ? 'border-green-500 bg-green-500/5' : 'border-border'}`}
                  >
                    <p className={`font-medium text-sm mb-2 ${isCurrentMonth ? 'text-green-600' : ''}`}>
                      {name} {isCurrentMonth && '(Current)'}
                    </p>
                    {personalLineKeys.map((key, lineIdx) => (
                      <Input
                        key={key}
                        placeholder={lineIdx === 0 ? 'Personal Focus' : lineIdx === 1 ? 'Target (e.g., gym 3x/week)' : `Goal ${lineIdx + 1}`}
                        value={(goal as any)[key] || ''}
                        onChange={(e) => updateMonthlyGoal(idx, key, e.target.value)}
                        className={`text-sm border-green-500/20 focus:border-green-500 ${lineIdx < 6 ? 'mb-1.5' : ''}`}
                      />
                    ))}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Button onClick={saveAnnualGoals} disabled={saving} className="w-full bg-primary text-primary-foreground">
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Monthly Goals'}
          </Button>
        </TabsContent>

        {/* ANNUAL TAB */}
        <TabsContent value="annual" className="space-y-6">
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" /> Annual Goals ({annualGoals.year})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Units Goal</Label>
                  <Input
                    type="number"
                    placeholder="24"
                    value={annualGoals.annual_units_goal}
                    onChange={(e) => setAnnualGoals({ ...annualGoals, annual_units_goal: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>GCI Goal ($)</Label>
                  <Input
                    type="number"
                    placeholder="150000"
                    value={annualGoals.annual_gci_goal}
                    onChange={(e) => setAnnualGoals({ ...annualGoals, annual_gci_goal: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Volume Goal ($)</Label>
                  <Input
                    type="number"
                    placeholder="5000000"
                    value={annualGoals.annual_volume_goal}
                    onChange={(e) => setAnnualGoals({ ...annualGoals, annual_volume_goal: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Annual Focus / Big Why</Label>
                <Textarea
                  placeholder="What's your driving motivation this year? Your 'One Thing'?"
                  value={annualGoals.annual_focus || ''}
                  onChange={(e) => setAnnualGoals({ ...annualGoals, annual_focus: e.target.value })}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          <Button onClick={saveAnnualGoals} disabled={saving} className="w-full bg-primary text-primary-foreground">
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Annual Goals'}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FourOneOne;
