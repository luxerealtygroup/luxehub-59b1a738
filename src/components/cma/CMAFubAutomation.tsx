import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CalendarPlus, Clock, RefreshCw, CheckCircle } from 'lucide-react';
import { addDays, format } from 'date-fns';

interface CMAFubAutomationProps {
  reportId: string;
  fubPersonId: number | null;
  fubPersonName: string | null;
  propertyAddress: string;
  listingStatus: string;
  fubAutomationLog: Array<{ action: string; at: string; fub_task_id?: string }>;
  onUpdate: () => void;
}

const CMAFubAutomation = ({
  reportId,
  fubPersonId,
  fubPersonName,
  propertyAddress,
  listingStatus,
  fubAutomationLog,
  onUpdate,
}: CMAFubAutomationProps) => {
  const [followUpDays, setFollowUpDays] = useState('7');
  const [customDate, setCustomDate] = useState('');
  const [pushing, setPushing] = useState<string | null>(null);

  if (!fubPersonId) return null;

  const logAction = async (action: string, extra?: Record<string, unknown>) => {
    const newLog = [...fubAutomationLog, { action, at: new Date().toISOString(), ...extra }];
    await supabase
      .from('cma_reports')
      .update({ fub_automation_log: newLog } as any)
      .eq('id', reportId);
  };

  const createFollowUpTask = async () => {
    setPushing('followup');
    try {
      const dueDate = followUpDays === 'custom'
        ? customDate
        : format(addDays(new Date(), parseInt(followUpDays)), 'yyyy-MM-dd');

      const { data, error } = await supabase.functions.invoke('follow-up-boss', {
        body: {
          action: 'create_note',
          params: {
            personId: fubPersonId,
            subject: `📋 Follow-Up Task: ${propertyAddress}`,
            body: `Follow-up scheduled for ${dueDate}.\nProperty: ${propertyAddress}\nCurrent Status: ${listingStatus}`,
            isHtml: false,
          },
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed');

      await logAction('follow_up_task_created', { due_date: dueDate });
      toast.success(`Follow-up note created for ${fubPersonName || 'contact'}`);
      onUpdate();
    } catch (err) {
      toast.error('Failed to create follow-up task');
      console.error(err);
    } finally {
      setPushing(null);
    }
  };

  const scheduleEquityCheckIn = async () => {
    setPushing('equity');
    try {
      const dueDate = format(addDays(new Date(), 90), 'yyyy-MM-dd');

      const { data, error } = await supabase.functions.invoke('follow-up-boss', {
        body: {
          action: 'create_note',
          params: {
            personId: fubPersonId,
            subject: '📈 Equity Update Review',
            body: `90-day equity check-in scheduled for ${dueDate}.\nProperty: ${propertyAddress}\nReview equity position and market conditions.`,
            isHtml: false,
          },
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed');

      await logAction('equity_checkin_scheduled', { due_date: dueDate });
      toast.success('Equity check-in scheduled in 90 days');
      onUpdate();
    } catch (err) {
      toast.error('Failed to schedule equity check-in');
      console.error(err);
    } finally {
      setPushing(null);
    }
  };

  const pushStageUpdate = async () => {
    setPushing('stage');
    try {
      const stageNote = `Listing status updated to: ${listingStatus}\nProperty: ${propertyAddress}`;

      const { data, error } = await supabase.functions.invoke('follow-up-boss', {
        body: {
          action: 'create_note',
          params: {
            personId: fubPersonId,
            subject: `🏠 Stage Update: ${listingStatus}`,
            body: stageNote,
            isHtml: false,
          },
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed');

      await logAction('stage_update_pushed', { stage: listingStatus });
      toast.success('Stage update pushed to FUB');
      onUpdate();
    } catch (err) {
      toast.error('Failed to push stage update');
      console.error(err);
    } finally {
      setPushing(null);
    }
  };

  const showStageUpdate = ['Listing Appointment Scheduled', 'Listing Signed'].includes(listingStatus);

  return (
    <Card className="border-gold/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-gold" /> FUB Automation
          <span className="text-xs text-muted-foreground font-normal ml-1">({fubPersonName})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Follow-Up Task */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Follow-Up In</Label>
            <Select value={followUpDays} onValueChange={setFollowUpDays}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="custom">Custom date</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {followUpDays === 'custom' && (
            <div>
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} className="w-[160px]" />
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={createFollowUpTask}
            disabled={pushing === 'followup' || (followUpDays === 'custom' && !customDate)}
            className="border-gold/30 text-gold hover:bg-gold/10"
          >
            {pushing === 'followup' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Clock className="h-4 w-4 mr-1" />}
            Create Follow-Up
          </Button>
        </div>

        {/* Equity Check-In */}
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={scheduleEquityCheckIn}
            disabled={pushing === 'equity'}
            className="border-gold/30 text-gold hover:bg-gold/10"
          >
            {pushing === 'equity' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Schedule 90-Day Equity Check-In
          </Button>
        </div>

        {/* Stage Update */}
        {showStageUpdate && (
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={pushStageUpdate}
              disabled={pushing === 'stage'}
              className="border-gold/30 text-gold hover:bg-gold/10"
            >
              {pushing === 'stage' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
              Push Stage Update to FUB
            </Button>
          </div>
        )}

        {/* Automation Log */}
        {fubAutomationLog.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground mb-2">Recent Automation ({fubAutomationLog.length})</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {fubAutomationLog.slice(-5).reverse().map((entry, i) => (
                <div key={i} className="text-xs flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span className="text-muted-foreground">{entry.action.replace(/_/g, ' ')}</span>
                  <span className="text-muted-foreground/60">
                    {new Date(entry.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CMAFubAutomation;
