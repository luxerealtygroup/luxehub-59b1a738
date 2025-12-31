import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, Clock, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface Milestone {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed_at: string | null;
  status: string;
  sort_order: number;
}

interface Transaction {
  id: string;
  property_address: string;
  transaction_type: string;
  status: string;
  offer_date: string | null;
  acceptance_date: string | null;
  inspection_date: string | null;
  appraisal_date: string | null;
  financing_deadline: string | null;
  closing_date: string | null;
}

interface TransactionTimelineProps {
  transaction: Transaction;
}

export function TransactionTimeline({ transaction }: TransactionTimelineProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMilestones = async () => {
      const { data } = await supabase
        .from('transaction_milestones')
        .select('*')
        .eq('transaction_id', transaction.id)
        .order('sort_order', { ascending: true });
      
      setMilestones(data || []);
      setLoading(false);
    };

    fetchMilestones();
  }, [transaction.id]);

  // Default milestones from transaction dates
  const defaultMilestones = [
    { title: 'Offer Submitted', date: transaction.offer_date, icon: '📝' },
    { title: 'Offer Accepted', date: transaction.acceptance_date, icon: '✅' },
    { title: 'Home Inspection', date: transaction.inspection_date, icon: '🔍' },
    { title: 'Appraisal', date: transaction.appraisal_date, icon: '📊' },
    { title: 'Financing Deadline', date: transaction.financing_deadline, icon: '🏦' },
    { title: 'Closing', date: transaction.closing_date, icon: '🏡' },
  ].filter(m => m.date);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-primary animate-pulse" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'in_progress':
        return 'bg-primary';
      default:
        return 'bg-muted';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Transaction Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted rounded" />
            ))}
          </div>
        ) : milestones.length > 0 ? (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" />
            
            <div className="space-y-6">
              {milestones.map((milestone, index) => (
                <div key={milestone.id} className="relative flex gap-4">
                  <div className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${getStatusColor(milestone.status)}`}>
                    {milestone.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-white" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`font-medium ${milestone.status === 'completed' ? 'text-muted-foreground line-through' : ''}`}>
                        {milestone.title}
                      </p>
                      {milestone.status === 'completed' && (
                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                          Complete
                        </Badge>
                      )}
                    </div>
                    {milestone.description && (
                      <p className="text-sm text-muted-foreground mt-1">{milestone.description}</p>
                    )}
                    {milestone.due_date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {milestone.completed_at 
                          ? `Completed ${format(new Date(milestone.completed_at), 'MMM d, yyyy')}`
                          : `Due ${format(new Date(milestone.due_date), 'MMM d, yyyy')}`
                        }
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : defaultMilestones.length > 0 ? (
          <div className="relative">
            <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-border" />
            
            <div className="space-y-4">
              {defaultMilestones.map((milestone, index) => {
                const isPast = new Date(milestone.date!) < new Date();
                return (
                  <div key={index} className="relative flex gap-4 items-start">
                    <div className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm ${isPast ? 'bg-green-500' : 'bg-muted'}`}>
                      {isPast ? (
                        <CheckCircle2 className="h-4 w-4 text-white" />
                      ) : (
                        <span>{milestone.icon}</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium ${isPast ? 'text-muted-foreground' : ''}`}>
                        {milestone.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(milestone.date!), 'EEEE, MMMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-4">
            No timeline events yet. Your agent will add milestones as your transaction progresses.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
