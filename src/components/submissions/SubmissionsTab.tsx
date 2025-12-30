import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Home, FileText, Building, ShoppingCart, Settings, Check, Loader2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';

export function SubmissionsTab() {
  const [agents, setAgents] = useState<Array<{ id: string; full_name: string | null }>>([]);
  const [activeFormTab, setActiveFormTab] = useState('open_house');
  const [asanaEnabled, setAsanaEnabled] = useState(false);
  const [asanaProjectId, setAsanaProjectId] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

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

    // Load saved Asana settings
    const savedEnabled = localStorage.getItem('asana_enabled');
    const savedProjectId = localStorage.getItem('asana_project_id');
    if (savedEnabled === 'true') {
      setAsanaEnabled(true);
    }
    if (savedProjectId) {
      setAsanaProjectId(savedProjectId);
    }
  }, []);

  const saveAsanaSettings = () => {
    localStorage.setItem('asana_enabled', asanaEnabled.toString());
    localStorage.setItem('asana_project_id', asanaProjectId);
    toast.success('Asana settings saved!');
    setSettingsOpen(false);
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    
    try {
      const { data, error } = await supabase.functions.invoke('asana-create-task', {
        body: {
          form_type: 'test',
          client_name: 'Connection Test',
          notes: 'This is a test task to verify Asana connection',
          project_id: asanaProjectId || undefined,
        },
      });

      if (error) throw error;
      
      setConnectionStatus('success');
      toast.success('Asana connection successful! Test task created.');
    } catch (error) {
      console.error('Asana connection test failed:', error);
      setConnectionStatus('error');
      toast.error('Failed to connect to Asana. Please check your access token.');
    } finally {
      setTestingConnection(false);
    }
  };

  const createAsanaTask = async (formType: string, data: any) => {
    if (!asanaEnabled) return;

    try {
      const { error } = await supabase.functions.invoke('asana-create-task', {
        body: {
          form_type: formType,
          property_address: data.property_address,
          client_name: data.client_name,
          agent_name: data.agent_name,
          notes: data.notes,
          project_id: asanaProjectId || undefined,
        },
      });

      if (error) throw error;
      toast.success('Asana task created!');
    } catch (error) {
      console.error('Failed to create Asana task:', error);
      toast.error('Failed to create Asana task');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              {asanaEnabled ? (
                <>
                  <Check className="h-3 w-3 mr-1 text-green-500" />
                  Asana Connected
                </>
              ) : (
                'Connect to Asana'
              )}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Asana Integration</DialogTitle>
              <DialogDescription>
                Automatically create Asana tasks when submissions are made.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Asana Integration</Label>
                  <p className="text-sm text-muted-foreground">
                    Create tasks automatically on submission
                  </p>
                </div>
                <Switch
                  checked={asanaEnabled}
                  onCheckedChange={setAsanaEnabled}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="projectId">Asana Project ID (Optional)</Label>
                <Input
                  id="projectId"
                  placeholder="1234567890123456"
                  value={asanaProjectId}
                  onChange={(e) => setAsanaProjectId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Find this in your Asana project URL: asana.com/0/[PROJECT_ID]/...
                </p>
              </div>

              <div className="flex gap-2">
                <Button onClick={saveAsanaSettings} className="flex-1">
                  Save Settings
                </Button>
                <Button 
                  variant="outline" 
                  onClick={testConnection}
                  disabled={testingConnection}
                >
                  {testingConnection ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : connectionStatus === 'success' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    'Test Connection'
                  )}
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
            <OpenHouseForm agents={agents} onSuccess={() => { createAsanaTask('open_house', {}); }} />
          </div>
        </TabsContent>

        <TabsContent value="invoice" className="mt-6">
          <div className="max-w-2xl mx-auto">
            <InvoiceForm agents={agents} onSuccess={() => { createAsanaTask('invoice', {}); }} />
          </div>
        </TabsContent>

        <TabsContent value="listing" className="mt-6">
          <div className="max-w-2xl mx-auto">
            <ListingForm agents={agents} onSuccess={() => { createAsanaTask('listing', {}); }} />
          </div>
        </TabsContent>

        <TabsContent value="buyer" className="mt-6">
          <div className="max-w-2xl mx-auto">
            <BuyerForm agents={agents} onSuccess={() => { createAsanaTask('buyer', {}); }} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
