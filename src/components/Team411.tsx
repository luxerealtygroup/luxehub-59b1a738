import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Target, Trophy, TrendingUp, ChevronLeft, ChevronRight, Users, Loader2, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, startOfWeek, addWeeks, subWeeks } from 'date-fns';

interface AgentProfile {
  id: string;
  full_name: string | null;
}

interface Weekly411Data {
  id: string;
  user_id: string;
  week_start_date: string;
  calls_goal: number | null;
  calls_actual: number | null;
  appointments_goal: number | null;
  appointments_actual: number | null;
  listings_goal: number | null;
  listings_actual: number | null;
  contracts_goal: number | null;
  contracts_actual: number | null;
  contacts_made: number | null;
  dials: number | null;
  doors_knocked: number | null;
  appointments_set: number | null;
  appointments_held: number | null;
  pipeline_additions: number | null;
  contracts_signed: number | null;
  firm_deals: number | null;
  database_size: number | null;
  priority_1: string | null;
  priority_1_completed: boolean | null;
  priority_2: string | null;
  priority_2_completed: boolean | null;
  priority_3: string | null;
  priority_3_completed: boolean | null;
  priority_4: string | null;
  priority_4_completed: boolean | null;
  personal_priority_1: string | null;
  personal_priority_1_completed: boolean | null;
  personal_priority_2: string | null;
  personal_priority_2_completed: boolean | null;
  personal_priority_3: string | null;
  personal_priority_3_completed: boolean | null;
  wins: string | null;
  challenges: string | null;
  next_steps: string | null;
  notes: string | null;
}

interface AppointmentRecordData {
  id: string;
  user_id: string;
  contact_name: string;
  fub_contact_id: number | null;
  appointment_date: string;
  appointment_type: string;
  outcome: string | null;
  notes: string | null;
}

interface ProductionGoalData {
  user_id: string;
  year: number;
  annual_units_goal: number | null;
  annual_gci_goal: number | null;
  annual_volume_goal: number | null;
  annual_focus: string | null;
  monthly_goals: any;
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const currentYear = 2026;
const currentMonth = new Date().getMonth();

const outcomeColors: Record<string, string> = {
  'Signed': 'bg-green-500/10 text-green-600 border-green-500/30',
  'Follow up': 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  'No show': 'bg-red-500/10 text-red-600 border-red-500/30',
  'Not moving forward': 'bg-muted text-muted-foreground border-border',
};

const Team411 = () => {
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [weeklyData, setWeeklyData] = useState<Weekly411Data[]>([]);
  const [appointmentRecords, setAppointmentRecords] = useState<AppointmentRecordData[]>([]);
  const [productionGoals, setProductionGoals] = useState<ProductionGoalData[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .not('full_name', 'is', null);

      const { data: usersWith411 } = await supabase
        .from('weekly_411')
        .select('user_id');

      const { data: usersWithGoals } = await supabase
        .from('production_goals')
        .select('user_id');

      const activeUserIds = new Set([
        ...(usersWith411 || []).map(w => w.user_id),
        ...(usersWithGoals || []).map(g => g.user_id),
      ]);

      const { data: fubProfiles } = await supabase
        .from('profiles')
        .select('id, fub_user_id')
        .not('fub_user_id', 'is', null);

      const fubMap = new Map((fubProfiles || []).map(p => [p.id, p.fub_user_id]));
      const adminOnlyFubId = 8;

      setAgents(
        (profiles || [])
          .filter(p => {
            const hasFub = fubMap.has(p.id) && fubMap.get(p.id) !== adminOnlyFubId;
            const hasData = activeUserIds.has(p.id);
            return (hasFub || hasData) && p.full_name;
          })
          .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
      );

      const weekStart = format(currentWeek, 'yyyy-MM-dd');
      const { data: weekly } = await supabase
        .from('weekly_411')
        .select('*')
        .eq('week_start_date', weekStart);

      setWeeklyData(weekly || []);

      // Fetch appointment records for this week
      const { data: appts } = await supabase
        .from('appointment_records')
        .select('*')
        .eq('week_start_date', weekStart)
        .order('appointment_date', { ascending: true });

      setAppointmentRecords(appts || []);

      const { data: goals } = await supabase
        .from('production_goals')
        .select('*')
        .eq('year', currentYear);

      setProductionGoals(goals || []);

      setLoading(false);
    };

    fetchData();
  }, [currentWeek]);

  const calcProgress = (actual: number, goal: number) => goal > 0 ? Math.min(100, (actual / goal) * 100) : 0;

  const filteredAgents = selectedAgent === 'all' 
    ? agents 
    : agents.filter(a => a.id === selectedAgent);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Agent Filter */}
      <div className="flex items-center gap-4">
        <Users className="h-5 w-5 text-primary" />
        <Select value={selectedAgent} onValueChange={setSelectedAgent}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Select agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Team Members</SelectItem>
            {agents.map(agent => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
            <h2 className="font-display text-lg font-semibold">
              Week of {format(currentWeek, 'MMM d, yyyy')}
            </h2>
            <Button variant="outline" size="sm" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {filteredAgents.map(agent => {
            const data = weeklyData.find(w => w.user_id === agent.id);
            const agentAppts = appointmentRecords.filter(a => a.user_id === agent.id);

            return (
              <Card key={agent.id} className="border-primary/10">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {(agent.full_name || '?').charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <CardTitle className="text-lg font-display">{agent.full_name}</CardTitle>
                    {!data && <Badge variant="outline" className="text-muted-foreground">No entry this week</Badge>}
                  </div>
                </CardHeader>
                {data && (
                  <CardContent className="space-y-4">
                    {/* New Activity Tracking Fields */}
                    <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
                      {[
                        { label: 'Contacts', value: data.contacts_made },
                        { label: 'Dials', value: data.dials },
                        { label: 'Doors', value: data.doors_knocked },
                        { label: 'Appts Set', value: data.appointments_set },
                        { label: 'Appts Held', value: agentAppts.length || data.appointments_held },
                        { label: 'Pipeline+', value: data.pipeline_additions },
                        { label: 'Contracts', value: data.contracts_signed },
                        { label: 'Firm', value: data.firm_deals },
                        { label: 'DB Size', value: data.database_size },
                      ].map(field => (
                        <div key={field.label} className="text-center p-2 rounded-lg bg-muted/50">
                          <p className="text-lg font-bold text-foreground">{field.value || 0}</p>
                          <p className="text-xs text-muted-foreground">{field.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Legacy Goal Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'Calls', actual: data.calls_actual || 0, goal: data.calls_goal || 0 },
                        { label: 'Appointments', actual: data.appointments_actual || 0, goal: data.appointments_goal || 0 },
                        { label: 'Listings', actual: data.listings_actual || 0, goal: data.listings_goal || 0 },
                        { label: 'Contracts', actual: data.contracts_actual || 0, goal: data.contracts_goal || 0 },
                      ].map(metric => (
                        <div key={metric.label} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{metric.label}</span>
                            <span className="font-medium">{metric.actual}/{metric.goal}</span>
                          </div>
                          <Progress value={calcProgress(metric.actual, metric.goal)} className="h-2" />
                        </div>
                      ))}
                    </div>

                    {/* Appointment Records */}
                    {agentAppts.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2 flex items-center gap-1">
                          <CalendarDays className="h-4 w-4" /> Appointments Held ({agentAppts.length})
                        </p>
                        <div className="space-y-1">
                          {agentAppts.map(appt => (
                            <div key={appt.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                              <span className="font-medium">{appt.contact_name}</span>
                              {appt.fub_contact_id && (
                                <Badge variant="outline" className="text-xs">FUB</Badge>
                              )}
                              <Badge variant="outline" className="text-xs capitalize">{appt.appointment_type}</Badge>
                              {appt.outcome && (
                                <Badge variant="outline" className={`text-xs ${outcomeColors[appt.outcome] || ''}`}>
                                  {appt.outcome}
                                </Badge>
                              )}
                              <span className="text-muted-foreground ml-auto text-xs">{appt.appointment_date}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Business Priorities */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-2">Business Priorities</p>
                        <div className="space-y-1">
                          {[1, 2, 3, 4].map(num => {
                            const text = data[`priority_${num}` as keyof Weekly411Data] as string || '';
                            const completed = data[`priority_${num}_completed` as keyof Weekly411Data] as boolean;
                            if (!text) return null;
                            return (
                              <div key={num} className="flex items-center gap-2 text-sm">
                                <span className={`${completed ? 'text-green-500' : 'text-muted-foreground'}`}>
                                  {completed ? '✅' : '⬜'}
                                </span>
                                <span className={completed ? 'line-through text-muted-foreground' : ''}>
                                  {text.replace(/^\[Carried\] /, '')}
                                </span>
                                {text.startsWith('[Carried]') && (
                                  <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">Carried</Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2 text-green-600">Personal Priorities</p>
                        <div className="space-y-1">
                          {[1, 2, 3].map(num => {
                            const text = data[`personal_priority_${num}` as keyof Weekly411Data] as string || '';
                            const completed = data[`personal_priority_${num}_completed` as keyof Weekly411Data] as boolean;
                            if (!text) return null;
                            return (
                              <div key={num} className="flex items-center gap-2 text-sm">
                                <span className={`${completed ? 'text-green-500' : 'text-muted-foreground'}`}>
                                  {completed ? '✅' : '⬜'}
                                </span>
                                <span className={completed ? 'line-through text-muted-foreground' : ''}>
                                  {text.replace(/^\[Carried\] /, '')}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Accountability Notes */}
                    {(data.wins || data.challenges || data.next_steps || data.notes) && (
                      <div className="grid md:grid-cols-2 gap-3 pt-2 border-t border-border">
                        {data.wins && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase">Wins</p>
                            <p className="text-sm">{data.wins}</p>
                          </div>
                        )}
                        {data.challenges && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase">Challenges</p>
                            <p className="text-sm">{data.challenges}</p>
                          </div>
                        )}
                        {data.next_steps && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase">Next Steps</p>
                            <p className="text-sm">{data.next_steps}</p>
                          </div>
                        )}
                        {data.notes && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase">Notes</p>
                            <p className="text-sm">{data.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {filteredAgents.length > 0 && weeklyData.filter(w => filteredAgents.some(a => a.id === w.user_id)).length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground">
                No 4-1-1 entries for this week yet.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* MONTHLY TAB */}
        <TabsContent value="monthly" className="space-y-6">
          {filteredAgents.map(agent => {
            const goals = productionGoals.find(g => g.user_id === agent.id);
            const monthlyGoals = (goals?.monthly_goals as any[]) || [];

            return (
              <Card key={agent.id} className="border-primary/10">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {(agent.full_name || '?').charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <CardTitle className="text-lg font-display">{agent.full_name}</CardTitle>
                    {!goals && <Badge variant="outline" className="text-muted-foreground">No goals set</Badge>}
                  </div>
                </CardHeader>
                {goals && monthlyGoals.length > 0 && (
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {monthNames.map((name, idx) => {
                        const monthGoal = monthlyGoals.find((g: any) => g.month === idx) || {};
                        const isCurrentMonth = idx === currentMonth;
                        const businessLines = [monthGoal.focus, monthGoal.target, monthGoal.line_3, monthGoal.line_4, monthGoal.line_5, monthGoal.line_6, monthGoal.line_7].filter(Boolean);
                        const personalLines = [monthGoal.personal_focus, monthGoal.personal_target, monthGoal.personal_line_3, monthGoal.personal_line_4, monthGoal.personal_line_5, monthGoal.personal_line_6, monthGoal.personal_line_7].filter(Boolean);
                        const hasFocus = businessLines.length > 0 || personalLines.length > 0;
                        if (!hasFocus && selectedAgent === 'all') return null;

                        return (
                          <div
                            key={name}
                            className={`p-3 rounded-lg border text-sm ${isCurrentMonth ? 'border-primary bg-primary/5' : 'border-border'}`}
                          >
                            <p className={`font-medium mb-1 ${isCurrentMonth ? 'text-primary' : ''}`}>
                              {name} {isCurrentMonth && '•'}
                            </p>
                            {businessLines.map((line, i) => (
                              <p key={i} className="text-muted-foreground">
                                {i === 0 && <span className="font-medium text-foreground">Biz: </span>}
                                {i > 0 && <span className="ml-3">• </span>}
                                {line}
                              </p>
                            ))}
                            {personalLines.map((line, i) => (
                              <p key={`p${i}`} className="text-green-600">
                                {i === 0 && <span className="font-medium">Personal: </span>}
                                {i > 0 && <span className="ml-3">• </span>}
                                {line}
                              </p>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </TabsContent>

        {/* ANNUAL TAB */}
        <TabsContent value="annual" className="space-y-6">
          {filteredAgents.map(agent => {
            const goals = productionGoals.find(g => g.user_id === agent.id);

            return (
              <Card key={agent.id} className="border-primary/10">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {(agent.full_name || '?').charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <CardTitle className="text-lg font-display">{agent.full_name}</CardTitle>
                    {!goals && <Badge variant="outline" className="text-muted-foreground">No goals set</Badge>}
                  </div>
                </CardHeader>
                {goals && (
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center p-3 rounded-lg bg-primary/5">
                        <p className="text-2xl font-bold text-primary">{goals.annual_units_goal || 0}</p>
                        <p className="text-xs text-muted-foreground">Units Goal</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-primary/5">
                        <p className="text-2xl font-bold text-primary">${(goals.annual_gci_goal || 0).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">GCI Goal</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-primary/5">
                        <p className="text-2xl font-bold text-primary">${(goals.annual_volume_goal || 0).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Volume Goal</p>
                      </div>
                    </div>
                    {goals.annual_focus && (
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Annual Focus / Big Why</p>
                        <p className="text-sm">{goals.annual_focus}</p>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Team411;
