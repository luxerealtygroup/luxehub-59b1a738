import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { FileUpload, uploadSubmissionFiles, getFilePublicUrls } from './FileUpload';

const formSchema = z.object({
  property_address: z.string().min(1, 'Property address is required'),
  agent_id: z.string().min(1, 'Agent is required'),
  door_knockers_needed: z.string().optional(),
  door_knockers_quantity: z.string().optional(),
  feature_sheets_needed: z.string().optional(),
  open_house_date: z.string().min(1, 'Date is required'),
  open_house_start_time: z.string().min(1, 'Start time is required'),
  open_house_end_time: z.string().min(1, 'End time is required'),
  second_date: z.string().optional(),
  second_start_time: z.string().optional(),
  second_end_time: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface OpenHouseFormProps {
  agents: Array<{ id: string; full_name: string | null }>;
  onSuccess?: (data: { 
    property_address: string; 
    agent_name: string; 
    open_house_date: string; 
    open_house_time: string; 
    door_knockers_needed?: string;
    door_knockers_quantity?: string;
    feature_sheets_needed?: string;
    notes?: string;
    attachment_urls?: Array<{ url: string; name: string }>;
  }) => void;
}

export function OpenHouseForm({ agents, onSuccess }: OpenHouseFormProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      property_address: '',
      agent_id: '',
      door_knockers_needed: '',
      door_knockers_quantity: '',
      feature_sheets_needed: '',
      open_house_date: '',
      open_house_start_time: '',
      open_house_end_time: '',
      second_date: '',
      second_start_time: '',
      second_end_time: '',
      notes: '',
    },
  });

  const doorKnockersNeeded = form.watch('door_knockers_needed');

  const onSubmit = async (data: FormData) => {
    if (!user) {
      toast.error('You must be logged in to submit');
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload attachments first
      let attachmentPaths: string[] = [];
      if (attachments.length > 0) {
        attachmentPaths = await uploadSubmissionFiles(attachments, user.id, 'open_house');
      }

      const selectedAgent = agents.find(a => a.id === data.agent_id);
      
      const { error } = await supabase.from('submissions').insert({
        form_type: 'open_house',
        user_id: user.id,
        agent_name: selectedAgent?.full_name || '',
        property_address: data.property_address,
        door_knockers_needed: data.door_knockers_needed || null,
        door_knockers_quantity: data.door_knockers_needed === 'Yes' ? data.door_knockers_quantity : null,
        feature_sheets_needed: data.feature_sheets_needed || null,
        open_house_date: data.open_house_date,
        open_house_time: `${data.open_house_start_time} - ${data.open_house_end_time}`,
        second_date: data.second_date || null,
        second_time: data.second_start_time && data.second_end_time 
          ? `${data.second_start_time} - ${data.second_end_time}` 
          : null,
        notes: data.notes || null,
        attachments: attachmentPaths,
      });

      if (error) throw error;

      // Get signed URLs for attachments to pass to Asana
      const attachmentUrls = attachments.length > 0 ? await getFilePublicUrls(attachments, attachmentPaths) : [];

      toast.success('Open house submission created successfully!');
      form.reset();
      setAttachments([]);
      onSuccess?.({
        property_address: data.property_address,
        agent_name: selectedAgent?.full_name || '',
        open_house_date: data.open_house_date,
        open_house_time: `${data.open_house_start_time} - ${data.open_house_end_time}`,
        door_knockers_needed: data.door_knockers_needed,
        door_knockers_quantity: data.door_knockers_needed === 'Yes' ? data.door_knockers_quantity : undefined,
        feature_sheets_needed: data.feature_sheets_needed,
        notes: data.notes,
        attachment_urls: attachmentUrls,
      });
    } catch (error: any) {
      console.error('Error submitting form:', error);
      toast.error(error.message || 'Failed to submit form');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open House Submission</CardTitle>
        <CardDescription>Preparing for a real estate open house</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="property_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property Address</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter property address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="agent_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agent *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose one..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.full_name || 'Unknown'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="door_knockers_needed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Door Knockers Needed</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose one..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {doorKnockersNeeded === 'Yes' && (
              <FormField
                control={form.control}
                name="door_knockers_quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>How many door knockers</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your answer" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="feature_sheets_needed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Feature Sheets Needed?</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose one..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="open_house_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="open_house_start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time *</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="open_house_end_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time *</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="second_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Second Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="second_start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Second Start Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="second_end_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Second End Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Any additional notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <Label>Attachments</Label>
              <FileUpload files={attachments} setFiles={setAttachments} />
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
