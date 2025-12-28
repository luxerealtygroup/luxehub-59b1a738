import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { Calendar, Plus, ExternalLink, Loader2, RefreshCw, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';

const GoogleCalendarWidget = () => {
  const { toast } = useToast();
  const {
    isConnected,
    isLoading,
    events,
    error,
    connect,
    disconnect,
    fetchEvents,
    createEvent,
  } = useGoogleCalendar();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({
    summary: '',
    description: '',
    date: '',
    startTime: '',
    endTime: '',
  });
  const [creating, setCreating] = useState(false);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.summary || !newEvent.date || !newEvent.startTime || !newEvent.endTime) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      const startDateTime = `${newEvent.date}T${newEvent.startTime}:00`;
      const endDateTime = `${newEvent.date}T${newEvent.endTime}:00`;
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      await createEvent({
        summary: newEvent.summary,
        description: newEvent.description || undefined,
        start: { dateTime: startDateTime, timeZone },
        end: { dateTime: endDateTime, timeZone },
      });

      toast({ title: 'Event created successfully!' });
      setCreateDialogOpen(false);
      setNewEvent({ summary: '', description: '', date: '', startTime: '', endTime: '' });
    } catch (err) {
      toast({
        title: 'Failed to create event',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const formatEventTime = (event: { start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } }) => {
    if (event.start.dateTime) {
      return format(parseISO(event.start.dateTime), 'MMM d, h:mm a');
    }
    if (event.start.date) {
      return format(parseISO(event.start.date), 'MMM d') + ' (All day)';
    }
    return 'No time set';
  };

  if (!isConnected) {
    return (
      <Card className="border-gold/10 bg-gradient-to-br from-card to-blue-500/5">
        <CardHeader>
          <CardTitle className="text-gold font-display flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Google Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-6">
          <Calendar className="h-12 w-12 mx-auto text-gold/30 mb-4" />
          <p className="text-muted-foreground mb-4">
            Connect your Google Calendar to view and create appointments
          </p>
          <Button 
            onClick={connect} 
            disabled={isLoading}
            className="bg-gold text-primary-foreground hover:bg-gold/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                Connect Calendar
              </>
            )}
          </Button>
          {error && (
            <p className="text-destructive text-sm mt-3">{error}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-gold/10 bg-gradient-to-br from-card to-blue-500/5">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-gold font-display flex items-center gap-2">
          <Calendar className="h-5 w-5" /> Google Calendar
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchEvents}
            disabled={isLoading}
            title="Refresh events"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" title="Create event">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="border-primary/20 bg-card max-w-md">
              <DialogHeader>
                <DialogTitle className="text-primary font-display">Create Calendar Event</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateEvent} className="space-y-4">
                <div className="space-y-2">
                  <Label>Event Title *</Label>
                  <Input
                    placeholder="e.g., Showing at 123 Main St"
                    value={newEvent.summary}
                    onChange={(e) => setNewEvent({ ...newEvent, summary: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={newEvent.date}
                    onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Time *</Label>
                    <Input
                      type="time"
                      value={newEvent.startTime}
                      onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time *</Label>
                    <Input
                      type="time"
                      value={newEvent.endTime}
                      onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Optional notes..."
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    rows={2}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={creating}
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Event'
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          <Button
            variant="ghost"
            size="icon"
            onClick={disconnect}
            title="Disconnect calendar"
            className="text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && events.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 text-gold animate-spin" />
            <span className="ml-2 text-muted-foreground">Loading events...</span>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-6">
            <Calendar className="h-10 w-10 mx-auto text-gold/30 mb-2" />
            <p className="text-muted-foreground">No upcoming events</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.slice(0, 5).map((event) => (
              <div
                key={event.id}
                className="p-3 rounded-lg bg-gold/5 border border-gold/10 hover:border-gold/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{event.summary}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatEventTime(event)}
                    </p>
                  </div>
                  {event.htmlLink && (
                    <a
                      href={event.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold hover:text-gold/80 shrink-0"
                      title="Open in Google Calendar"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
            {events.length > 5 && (
              <a
                href="https://calendar.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-sm text-gold hover:text-gold/80 pt-2"
              >
                View all {events.length} events →
              </a>
            )}
          </div>
        )}
        {error && (
          <p className="text-destructive text-sm mt-3 text-center">{error}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default GoogleCalendarWidget;
