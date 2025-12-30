import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { buyerSubmissionTypes } from './submissionOptions';

const formSchema = z.object({
  agent_id: z.string().min(1, 'Agent is required'),
  submission_type: z.string().min(1, 'Submission type is required'),
  buyer_names: z.string().min(1, 'Buyer name(s) required'),
  buyer_emails: z.string().optional(),
  buyer_phones: z.string().optional(),
  property_address: z.string().min(1, 'Property address is required'),
  lender_name_contact: z.string().optional(),
  purchase_price: z.string().min(1, 'Purchase price is required'),
  closing_date: z.string().min(1, 'Closing date is required'),
  client_occupation: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface BuyerFormProps {
  agents: Array<{ id: string; full_name: string | null }>;
  onSuccess?: () => void;
}

export function BuyerForm({ agents, onSuccess }: BuyerFormProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      agent_id: '',
      submission_type: '',
      buyer_names: '',
      buyer_emails: '',
      buyer_phones: '',
      property_address: '',
      lender_name_contact: '',
      purchase_price: '',
      closing_date: '',
      client_occupation: '',
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
      const selectedAgent = agents.find(a => a.id === data.agent_id);
      
      const { error } = await supabase.from('submissions').insert({
        form_type: 'buyer',
        user_id: user.id,
        agent_name: selectedAgent?.full_name || '',
        submission_type: data.submission_type,
        buyer_names: data.buyer_names,
        buyer_emails: data.buyer_emails || null,
        buyer_phones: data.buyer_phones || null,
        property_address: data.property_address,
        lender_name_contact: data.lender_name_contact || null,
        purchase_price: parseFloat(data.purchase_price),
        closing_date: data.closing_date,
        client_occupation: data.client_occupation || null,
        notes: data.notes || null,
      });

      if (error) throw error;

      toast.success('Buyer submission created successfully!');
      form.reset();
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
        <CardTitle>Buyer Submission</CardTitle>
        <CardDescription>Submit buyer transaction details</CardDescription>
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
                        {buyerSubmissionTypes.map((type) => (
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
              name="buyer_names"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Buyer Name(s) *</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter buyer name(s)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="buyer_emails"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Buyer Email(s)</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="Enter email(s)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="buyer_phones"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Buyer Phone(s)</FormLabel>
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

            <FormField
              control={form.control}
              name="lender_name_contact"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lender Name and Contact</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter lender name and contact info" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="purchase_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purchase Price *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="closing_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Closing Date *</FormLabel>
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
              name="client_occupation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Occupation</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter client occupation" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
              Submit Buyer
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
