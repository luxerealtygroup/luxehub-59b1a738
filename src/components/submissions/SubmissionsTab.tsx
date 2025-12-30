import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Home, FileText, Building, ShoppingCart, Settings, Check, Loader2, RefreshCw } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface AsanaProject {
  gid: string;
  name: string;
  workspace_name?: string;
}

interface AsanaSettings {
  enabled: boolean;
  projects: {
    open_house: string;
    invoice: string;
    listing: string;
    buyer: string;
  };
}

const defaultSettings: AsanaSettings = {
  enabled: false,
  projects: {
    open_house: '',
    invoice: '',
    listing: '',
    buyer: '',
  },
};

export function SubmissionsTab() {
  const [agents, setAgents] = useState<Array<{ id: string; full_name: string | null }>>([]);
  const [activeFormTab, setActiveFormTab] = useState('open_house');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  // Asana settings
  const [asanaSettings, setAsanaSettings] = useState<AsanaSettings>(defaultSettings);
  const [asanaProjects, setAsanaProjects] = useState<AsanaProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

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
    const savedSettings = localStorage.getItem('asana_settings');
    if (savedSettings) {
      try {
        setAsanaSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error('Failed to parse Asana settings:', e);
      }
    }
  }, []);

  const fetchAsanaProjects = async () => {
    setLoadingProjects(true);
    try {
      const { data, error } = await supabase.functions.invoke('asana-create-task', {
        body: { action: 'get_projects' },
      });

      if (error) throw error;
      
      setAsanaProjects(data.projects || []);
      toast.success(`Loaded ${data.projects?.length || 0} Asana projects`);
    } catch (error) {
      console.error('Failed to fetch Asana projects:', error);
      toast.error('Failed to fetch Asana projects. Check your access token.');
    } finally {
      setLoadingProjects(false);
    }
  };

  const saveAsanaSettings = () => {
    localStorage.setItem('asana_settings', JSON.stringify(asanaSettings));
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

  const createAsanaTask = async (formType: 'open_house' | 'invoice' | 'listing' | 'buyer', formData: any) => {
    if (!asanaSettings.enabled) return;

    const projectId = asanaSettings.projects[formType];

    try {
      const { error } = await supabase.functions.invoke('asana-create-task', {
        body: {
          form_type: formType,
          property_address: formData.property_address,
          client_name: formData.client_name,
          agent_name: formData.agent_name,
          notes: formData.notes,
          project_id: projectId || undefined,
          // Include form-specific data
          open_house_date: formData.open_house_date,
          open_house_time: formData.open_house_time,
          list_price: formData.list_price,
          purchase_price: formData.purchase_price,
          closing_date: formData.closing_date,
          vendor_name: formData.vendor_name,
          invoice_amount: formData.invoice_amount,
        },
      });

      if (error) throw error;
      toast.success('Asana task created!');
    } catch (error) {
      console.error('Failed to create Asana task:', error);
      toast.error('Failed to create Asana task');
    }
  };

  const updateProjectSetting = (formType: keyof AsanaSettings['projects'], projectId: string) => {
    setAsanaSettings(prev => ({
      ...prev,
      projects: {
        ...prev.projects,
        [formType]: projectId,
      },
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              {asanaSettings.enabled ? (
                <>
                  <Check className="h-3 w-3 mr-1 text-green-500" />
                  Asana Connected
                </>
              ) : (
                'Connect to Asana'
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Asana Integration</DialogTitle>
              <DialogDescription>
                Automatically create Asana tasks when submissions are made. Configure which project receives each form type.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pt-4 pr-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Asana Integration</Label>
                    <p className="text-sm text-muted-foreground">
                      Create tasks automatically on submission
                    </p>
                  </div>
                  <Switch
                    checked={asanaSettings.enabled}
                    onCheckedChange={(checked) => setAsanaSettings(prev => ({ ...prev, enabled: checked }))}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Asana Projects</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={fetchAsanaProjects}
                      disabled={loadingProjects}
                    >
                      {loadingProjects ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <span className="ml-1">Load Projects</span>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Click "Load Projects" to fetch your Asana projects, then assign each form type to a project.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Home className="h-4 w-4" />
                      Open House Project
                    </Label>
                    <Select
                      value={asanaSettings.projects.open_house || 'none'}
                      onValueChange={(v) => updateProjectSetting('open_house', v === 'none' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select project..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (use default workspace)</SelectItem>
                        {asanaProjects.map((project) => (
                          <SelectItem key={project.gid} value={project.gid}>
                            {project.name} {project.workspace_name && `(${project.workspace_name})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Invoice Project
                    </Label>
                    <Select
                      value={asanaSettings.projects.invoice || 'none'}
                      onValueChange={(v) => updateProjectSetting('invoice', v === 'none' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select project..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (use default workspace)</SelectItem>
                        {asanaProjects.map((project) => (
                          <SelectItem key={project.gid} value={project.gid}>
                            {project.name} {project.workspace_name && `(${project.workspace_name})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      Listing Project
                    </Label>
                    <Select
                      value={asanaSettings.projects.listing || 'none'}
                      onValueChange={(v) => updateProjectSetting('listing', v === 'none' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select project..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (use default workspace)</SelectItem>
                        {asanaProjects.map((project) => (
                          <SelectItem key={project.gid} value={project.gid}>
                            {project.name} {project.workspace_name && `(${project.workspace_name})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4" />
                      Buyer Project
                    </Label>
                    <Select
                      value={asanaSettings.projects.buyer || 'none'}
                      onValueChange={(v) => updateProjectSetting('buyer', v === 'none' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select project..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (use default workspace)</SelectItem>
                        {asanaProjects.map((project) => (
                          <SelectItem key={project.gid} value={project.gid}>
                            {project.name} {project.workspace_name && `(${project.workspace_name})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

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
            </ScrollArea>
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
