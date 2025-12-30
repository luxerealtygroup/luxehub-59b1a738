import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Home, FileText, Building, ShoppingCart, Settings, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { OpenHouseForm } from './OpenHouseForm';
import { InvoiceForm } from './InvoiceForm';
import { ListingForm } from './ListingForm';
import { BuyerForm } from './BuyerForm';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function SubmissionsTab() {
  const [agents, setAgents] = useState<Array<{ id: string; full_name: string | null }>>([]);
  const [activeFormTab, setActiveFormTab] = useState('open_house');
  const [zapierWebhookUrl, setZapierWebhookUrl] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const fetchAgents = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name');
      
      if (!error && data) {
        setAgents(data);
      }
    };

    fetchAgents();

    // Load saved webhook URL from localStorage
    const savedWebhook = localStorage.getItem('asana_zapier_webhook');
    if (savedWebhook) {
      setZapierWebhookUrl(savedWebhook);
    }
  }, []);

  const saveWebhookUrl = () => {
    localStorage.setItem('asana_zapier_webhook', zapierWebhookUrl);
    toast.success('Zapier webhook URL saved!');
    setSettingsOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Connect to Asana
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect to Asana via Zapier</DialogTitle>
              <DialogDescription>
                To automatically create Asana tasks from submissions, set up a Zapier integration.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>How to set up:</Label>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Go to <a href="https://zapier.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Zapier.com</a> and create an account</li>
                  <li>Create a new Zap with "Webhooks by Zapier" as the trigger</li>
                  <li>Choose "Catch Hook" as the trigger event</li>
                  <li>Copy the webhook URL Zapier gives you</li>
                  <li>Add "Asana" as the action and choose "Create Task"</li>
                  <li>Map the submission fields to your Asana task</li>
                  <li>Paste the webhook URL below</li>
                </ol>
              </div>
              <div className="space-y-2">
                <Label htmlFor="webhook">Zapier Webhook URL</Label>
                <Input
                  id="webhook"
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                  value={zapierWebhookUrl}
                  onChange={(e) => setZapierWebhookUrl(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={saveWebhookUrl} className="flex-1">
                  Save Webhook URL
                </Button>
                <Button variant="outline" asChild>
                  <a href="https://zapier.com/apps/asana/integrations/webhook" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Guide
                  </a>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
            <OpenHouseForm agents={agents} onSuccess={() => triggerZapier('open_house')} />
          </div>
        </TabsContent>

        <TabsContent value="invoice" className="mt-6">
          <div className="max-w-2xl mx-auto">
            <InvoiceForm agents={agents} onSuccess={() => triggerZapier('invoice')} />
          </div>
        </TabsContent>

        <TabsContent value="listing" className="mt-6">
          <div className="max-w-2xl mx-auto">
            <ListingForm agents={agents} onSuccess={() => triggerZapier('listing')} />
          </div>
        </TabsContent>

        <TabsContent value="buyer" className="mt-6">
          <div className="max-w-2xl mx-auto">
            <BuyerForm agents={agents} onSuccess={() => triggerZapier('buyer')} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );

  async function triggerZapier(formType: string) {
    const webhookUrl = localStorage.getItem('asana_zapier_webhook');
    if (!webhookUrl) return;

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'no-cors',
        body: JSON.stringify({
          form_type: formType,
          timestamp: new Date().toISOString(),
          source: 'RealtyHub Submissions',
        }),
      });
      console.log('Zapier webhook triggered for:', formType);
    } catch (error) {
      console.error('Failed to trigger Zapier webhook:', error);
    }
  }
}
