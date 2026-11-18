import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Home, FileText, Building, ShoppingCart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAgentOptions } from '@/lib/agentOptions';
import { OpenHouseForm } from './OpenHouseForm';
import { InvoiceForm } from './InvoiceForm';
import { ListingForm } from './ListingForm';
import { BuyerForm } from './BuyerForm';
import { SlackSyncAlert } from './SlackSyncAlert';
import { SlackDestinations } from './SlackDestinations';
import { toast } from 'sonner';

export function SubmissionsTab() {
  const [agents, setAgents] = useState<Array<{ id: string; full_name: string | null }>>([]);
  const [activeFormTab, setActiveFormTab] = useState('open_house');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchAgentOptions().then(rows => {
      if (!cancelled) setAgents(rows.map(row => ({ id: row.id, full_name: row.full_name })));
    }).catch(() => toast.error('Could not load agents'));
    return () => { cancelled = true; };
  }, []);

  const postToSlack = async (_formType: string, formData: { submission_id?: string }) => {
    try {
      if (!formData.submission_id) throw new Error('Missing saved submission ID');
      const { data, error } = await supabase.functions.invoke('slack-post-submission', {
        body: { action: 'post', submission_id: formData.submission_id },
      });
      if (error || (!data?.skipped && data?.ok !== true)) throw new Error('Slack post failed');
      if (!data?.skipped) toast.success('Posted to Slack');
    } catch {
      toast.warning('Submission saved, but the Slack post failed. The office has been notified in the sync alert.');
    } finally {
      setRefresh(value => value + 1);
    }
  };

  return (
    <div className="space-y-6">
      <SlackSyncAlert refresh={refresh} />
      <div className="flex justify-end"><SlackDestinations onSaved={() => setRefresh(value => value + 1)} /></div>

      <Tabs value={activeFormTab} onValueChange={setActiveFormTab}>
        <TabsList className="grid w-full grid-cols-4 bg-muted">
          <TabsTrigger value="open_house" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Home className="h-4 w-4 mr-2" />
            Open House
          </TabsTrigger>
          <TabsTrigger value="invoice" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FileText className="h-4 w-4 mr-2" />
            Invoice
          </TabsTrigger>
          <TabsTrigger value="listing" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Building className="h-4 w-4 mr-2" />
            Listing
          </TabsTrigger>
          <TabsTrigger value="buyer" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Buyer
          </TabsTrigger>
        </TabsList>

        <TabsContent value="open_house" className="mt-6">
          <div className="max-w-2xl mx-auto">
            <OpenHouseForm agents={agents} onSuccess={(formData) => { void postToSlack('open_house', formData); }} />
          </div>
        </TabsContent>

        <TabsContent value="invoice" className="mt-6">
          <div className="max-w-2xl mx-auto">
            <InvoiceForm agents={agents} onSuccess={(formData) => { void postToSlack('invoice', formData); }} />
          </div>
        </TabsContent>

        <TabsContent value="listing" className="mt-6">
          <div className="max-w-2xl mx-auto">
            <ListingForm agents={agents} onSuccess={(formData) => { void postToSlack('listing', formData); }} />
          </div>
        </TabsContent>

        <TabsContent value="buyer" className="mt-6">
          <div className="max-w-2xl mx-auto">
            <BuyerForm agents={agents} onSuccess={(formData) => { void postToSlack('buyer', formData); }} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
