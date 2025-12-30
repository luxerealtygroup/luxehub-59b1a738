import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface AsanaCustomField {
  gid: string;
  name: string;
  type: string;
  enum_options?: Array<{ gid: string; name: string }>;
}

interface FieldMapping {
  [formField: string]: string; // formField -> asana custom field gid
}

interface AsanaFieldMappingProps {
  formType: 'open_house' | 'invoice' | 'listing' | 'buyer';
  projectId: string;
  mappings: FieldMapping;
  onMappingsChange: (mappings: FieldMapping) => void;
}

const FORM_FIELDS: Record<string, Array<{ key: string; label: string }>> = {
  open_house: [
    { key: 'property_address', label: 'Property Address' },
    { key: 'agent_name', label: 'Agent Name' },
    { key: 'open_house_date', label: 'Open House Date' },
    { key: 'open_house_time', label: 'Open House Time' },
    { key: 'door_knockers_needed', label: 'Door Knockers Needed' },
    { key: 'door_knockers_quantity', label: 'How Many Door Knockers' },
    { key: 'feature_sheets_needed', label: 'Feature Sheets Needed' },
  ],
  invoice: [
    { key: 'vendor_name', label: 'Vendor Name' },
    { key: 'vendor_type', label: 'Vendor Type' },
    { key: 'invoice_amount', label: 'Invoice Amount' },
    { key: 'property_address', label: 'Property Address' },
    { key: 'agent_name', label: 'Agent Name' },
  ],
  listing: [
    { key: 'property_address', label: 'Property Address' },
    { key: 'seller_names', label: 'Seller Name(s)' },
    { key: 'list_price', label: 'List Price' },
    { key: 'listing_date', label: 'Listing Date' },
    { key: 'agent_name', label: 'Agent Name' },
  ],
  buyer: [
    { key: 'client_name', label: 'Client Name' },
    { key: 'property_address', label: 'Property Address' },
    { key: 'purchase_price', label: 'Purchase Price' },
    { key: 'closing_date', label: 'Closing Date' },
    { key: 'agent_name', label: 'Agent Name' },
    { key: 'lender_name_contact', label: 'Lender' },
  ],
};

export function AsanaFieldMapping({ formType, projectId, mappings, onMappingsChange }: AsanaFieldMappingProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customFields, setCustomFields] = useState<AsanaCustomField[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCustomFields = async () => {
    if (!projectId) {
      setCustomFields([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('asana-create-task', {
        body: { action: 'get_custom_fields', project_id: projectId },
      });

      if (error) throw error;

      setCustomFields(data.custom_fields || []);
      if (data.custom_fields?.length === 0) {
        toast.info('No custom fields found in this project');
      }
    } catch (error) {
      console.error('Failed to fetch custom fields:', error);
      toast.error('Failed to fetch custom fields');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && projectId && customFields.length === 0) {
      fetchCustomFields();
    }
  }, [isOpen, projectId]);

  const formFields = FORM_FIELDS[formType] || [];

  const updateMapping = (formField: string, asanaFieldGid: string) => {
    onMappingsChange({
      ...mappings,
      [formField]: asanaFieldGid === 'none' ? '' : asanaFieldGid,
    });
  };

  if (!projectId) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-md p-2 bg-muted/30">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between">
          <span className="text-xs">Custom Field Mapping</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">Loading custom fields...</span>
          </div>
        ) : customFields.length === 0 ? (
          <div className="text-center py-2">
            <p className="text-xs text-muted-foreground mb-2">No custom fields loaded</p>
            <Button variant="outline" size="sm" onClick={fetchCustomFields}>
              Load Custom Fields
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {formFields.map((field) => (
              <div key={field.key} className="flex items-center gap-2">
                <Label className="text-xs w-28 shrink-0">{field.label}</Label>
                <Select
                  value={mappings[field.key] || 'none'}
                  onValueChange={(v) => updateMapping(field.key, v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Not mapped" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not mapped</SelectItem>
                    {customFields.map((cf) => (
                      <SelectItem key={cf.gid} value={cf.gid}>
                        {cf.name} ({cf.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
