import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Phone, Calendar, Users, Mail, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import FUBActivityFeed from '@/components/FUBActivityFeed';

type ActivityType = 'call' | 'appointment' | 'showing' | 'follow_up' | 'email' | 'meeting' | 'other';

interface Activity {
  id: string;
  activity_type: ActivityType;
  client_name: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string;
}

const activityIcons: Record<ActivityType, React.ReactNode> = {
  call: <Phone className="h-4 w-4" />,
  appointment: <Calendar className="h-4 w-4" />,
  showing: <Users className="h-4 w-4" />,
  follow_up: <Clock className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  meeting: <Users className="h-4 w-4" />,
  other: <Clock className="h-4 w-4" />,
};

const Activities = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [newActivity, setNewActivity] = useState({
    activity_type: 'call' as ActivityType,
    client_name: '',
    scheduled_at: '',
    duration_minutes: '',
    notes: ''
  });

  const fetchActivities = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('agent_activities')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setActivities(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchActivities();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const { error } = await supabase.from('agent_activities').insert({
      user_id: user.id,
      activity_type: newActivity.activity_type,
      client_name: newActivity.client_name || null,
      scheduled_at: newActivity.scheduled_at || null,
      duration_minutes: newActivity.duration_minutes ? parseInt(newActivity.duration_minutes) : null,
      notes: newActivity.notes || null,
      completed_at: new Date().toISOString()
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Activity logged!' });
      setDialogOpen(false);
      setNewActivity({ activity_type: 'call', client_name: '', scheduled_at: '', duration_minutes: '', notes: '' });
      fetchActivities();
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gold animate-pulse">Loading activities...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Activities</h1>
          <p className="text-muted-foreground mt-1">Track your calls, appointments, and showings</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gold text-gold-foreground hover:bg-gold/90">
              <Plus className="h-4 w-4 mr-2" /> Log Activity
            </Button>
          </DialogTrigger>
          <DialogContent className="border-gold/20 bg-card">
            <DialogHeader>
              <DialogTitle className="text-gold font-display">Log New Activity</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Select 
                value={newActivity.activity_type} 
                onValueChange={(v) => setNewActivity({ ...newActivity, activity_type: v as ActivityType })}
              >
                <SelectTrigger className="border-border">
                  <SelectValue placeholder="Activity type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="appointment">Appointment</SelectItem>
                  <SelectItem value="showing">Showing</SelectItem>
                  <SelectItem value="follow_up">Follow Up</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Client name"
                value={newActivity.client_name}
                onChange={(e) => setNewActivity({ ...newActivity, client_name: e.target.value })}
              />
              <Input
                type="datetime-local"
                value={newActivity.scheduled_at}
                onChange={(e) => setNewActivity({ ...newActivity, scheduled_at: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Duration (minutes)"
                value={newActivity.duration_minutes}
                onChange={(e) => setNewActivity({ ...newActivity, duration_minutes: e.target.value })}
              />
              <Input
                placeholder="Notes"
                value={newActivity.notes}
                onChange={(e) => setNewActivity({ ...newActivity, notes: e.target.value })}
              />
              <Button type="submit" className="w-full bg-gold text-gold-foreground hover:bg-gold/90">
                Save Activity
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="fub" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fub">Follow Up Boss Activity</TabsTrigger>
          <TabsTrigger value="local">My Logged Activities</TabsTrigger>
        </TabsList>

        <TabsContent value="fub">
          <FUBActivityFeed limit={50} title="Follow Up Boss Activity" />
        </TabsContent>

        <TabsContent value="local">
          <Card className="border-gold/10 bg-card/50">
            <CardHeader>
              <CardTitle className="text-gold font-display">Recent Activities</CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No activities logged yet. Start tracking your work!</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gold/10">
                      <TableHead>Type</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((activity) => (
                      <TableRow key={activity.id} className="border-gold/10">
                        <TableCell>
                          <Badge variant="outline" className="border-gold/30 text-gold gap-1">
                            {activityIcons[activity.activity_type]}
                            {activity.activity_type.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{activity.client_name || '-'}</TableCell>
                        <TableCell>{format(new Date(activity.created_at), 'MMM d, yyyy')}</TableCell>
                        <TableCell>{activity.duration_minutes ? `${activity.duration_minutes} min` : '-'}</TableCell>
                        <TableCell className="max-w-xs truncate">{activity.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Activities;
