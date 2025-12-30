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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { listingSubmissionTypes, photographyPackages, occupancyOptions } from './submissionOptions';
import { FileUpload, uploadSubmissionFiles } from './FileUpload';

const formSchema = z.object({
  agent_id: z.string().min(1, 'Agent is required'),
  submission_type: z.string().min(1, 'Submission type is required'),
  seller_names: z.string().min(1, 'Seller name(s) required'),
  seller_emails: z.string().optional(),
  seller_phones: z.string().optional(),
  property_address: z.string().min(1, 'Property address is required'),
  list_price: z.string().min(1, 'List price is required'),
  listing_date: z.string().min(1, 'Listing date is required'),
  photography_package: z.string().optional(),
  staging_consult: z.string().optional(),
  occupancy: z.string().optional(),
  door_knockers: z.string().optional(),
  feature_sheets: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface ListingFormProps {
  agents: Array<{ id: string; full_name: string | null }>;
  onSuccess?: () => void;
}

export function ListingForm({ agents, onSuccess }: ListingFormProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      agent_id: '',
      submission_type: '',
      seller_names: '',
      seller_emails: '',
      seller_phones: '',
      property_address: '',
      list_price: '',
      listing_date: '',
      photography_package: '',
      staging_consult: 'no',
      occupancy: '',
      door_knockers: 'no',
      feature_sheets: 'no',
      notes: '',
    },
  });

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
        attachmentPaths = await uploadSubmissionFiles(attachments, user.id, 'listing');
      }

      const selectedAgent = agents.find(a => a.id === data.agent_id);
      
      const { error } = await supabase.from('submissions').insert({
        form_type: 'listing',
        user_id: user.id,
        agent_name: selectedAgent?.full_name || '',
        submission_type: data.submission_type,
        seller_names: data.seller_names,
        seller_emails: data.seller_emails || null,
        seller_phones: data.seller_phones || null,
        property_address: data.property_address,
        list_price: parseFloat(data.list_price),
        listing_date: data.listing_date,
        photography_package: data.photography_package || null,
        staging_consult: data.staging_consult === 'yes',
        occupancy: data.occupancy || null,
        door_knockers: data.door_knockers === 'yes',
        feature_sheets: data.feature_sheets === 'yes',
        listing_notes: data.notes || null,
        attachments: attachmentPaths,
      });

      if (error) throw error;

      toast.success('Listing submission created successfully!');
      form.reset();
      setAttachments([]);
      onSuccess?.();
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
        <CardTitle>Listing Submission</CardTitle>
        <CardDescription>Submit a new listing or listing update</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="agent_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agent *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select agent..." />
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
                name="submission_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Submission Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose one..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {listingSubmissionTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="seller_names"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Seller Name(s) *</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter seller name(s)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="seller_emails"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seller Email(s)</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="Enter email(s)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="seller_phones"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seller Phone(s)</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter phone number(s)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="property_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property Address *</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter property address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="list_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>List Price *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="listing_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Listing Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="photography_package"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Photography Package</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose one..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {photographyPackages.map((pkg) => (
                        <SelectItem key={pkg} value={pkg}>
                          {pkg}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="staging_consult"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Staging Consult Needed?</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="yes" id="staging-yes" />
                          <Label htmlFor="staging-yes">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="no" id="staging-no" />
                          <Label htmlFor="staging-no">No</Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="occupancy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Occupancy Information</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose one..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {occupancyOptions.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="door_knockers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Door Knockers Needed?</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="yes" id="knockers-yes" />
                          <Label htmlFor="knockers-yes">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="no" id="knockers-no" />
                          <Label htmlFor="knockers-no">No</Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="feature_sheets"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Feature Sheets Needed?</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="yes" id="sheets-yes" />
                          <Label htmlFor="sheets-yes">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="no" id="sheets-no" />
                          <Label htmlFor="sheets-no">No</Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Attachments (Contracts, photos, documents)</Label>
              <FileUpload files={attachments} setFiles={setAttachments} />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Any additional notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Listing
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
