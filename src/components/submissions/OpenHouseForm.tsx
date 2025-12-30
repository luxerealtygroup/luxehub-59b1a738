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

const formSchema = z.object({
  agent_id: z.string().min(1, 'Agent is required'),
  property_address: z.string().min(1, 'Property address is required'),
  open_house_date: z.string().min(1, 'Date is required'),
  open_house_time: z.string().min(1, 'Time is required'),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface OpenHouseFormProps {
  agents: Array<{ id: string; full_name: string | null }>;
  onSuccess?: () => void;
}

export function OpenHouseForm({ agents, onSuccess }: OpenHouseFormProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      agent_id: '',
      property_address: '',
      open_house_date: '',
      open_house_time: '',
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
        form_type: 'open_house',
        user_id: user.id,
        agent_name: selectedAgent?.full_name || '',
        property_address: data.property_address,
        open_house_date: data.open_house_date,
        open_house_time: data.open_house_time,
        notes: data.notes || null,
      });

      if (error) throw error;

      toast.success('Open house submission created successfully!');
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
        <CardTitle>Open House Submission</CardTitle>
        <CardDescription>Submit details for an upcoming open house</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

              <FormField
                control={form.control}
                name="open_house_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time *</FormLabel>
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

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Open House
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
