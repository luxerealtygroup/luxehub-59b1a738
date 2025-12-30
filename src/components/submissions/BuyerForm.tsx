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
import { buyerSubmissionTypes } from './submissionOptions';
import { FileUpload, uploadSubmissionFiles } from './FileUpload';

const formSchema = z.object({
  submission_type: z.string().min(1, 'Submission type is required'),
  agent_id: z.string().min(1, 'Agent is required'),
  client_name: z.string().min(1, 'Client name is required'),
  lender_name_contact: z.string().optional(),
  closing_date: z.string().optional(),
  condition_due_sbp: z.string().optional(),
  condition_due_financing: z.string().optional(),
  condition_due_status: z.string().optional(),
  condition_due_home_inspection: z.string().optional(),
  condition_due_other: z.string().optional(),
  condition_other_description: z.string().optional(),
  notes: z.string().optional(),
  client_occupation: z.string().optional(),
  firm_price: z.string().optional(),
  conditional_price: z.string().optional(),
  cooperating_commission: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface BuyerFormProps {
  agents: Array<{ id: string; full_name: string | null }>;
  onSuccess?: () => void;
}

export function BuyerForm({ agents, onSuccess }: BuyerFormProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [braRecoFiles, setBraRecoFiles] = useState<File[]>([]);
  const [idsFiles, setIdsFiles] = useState<File[]>([]);
  const [fintrackerFiles, setFintrackerFiles] = useState<File[]>([]);
  const [otherDocsFiles, setOtherDocsFiles] = useState<File[]>([]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      submission_type: '',
      agent_id: '',
      client_name: '',
      lender_name_contact: '',
      closing_date: '',
      condition_due_sbp: '',
      condition_due_financing: '',
      condition_due_status: '',
      condition_due_home_inspection: '',
      condition_due_other: '',
      condition_other_description: '',
      notes: '',
      client_occupation: '',
      firm_price: '',
      conditional_price: '',
      cooperating_commission: '',
    },
  });

  const conditionDueOther = form.watch('condition_due_other');

  const onSubmit = async (data: FormData) => {
    if (!user) {
      toast.error('You must be logged in to submit');
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload all file categories
      let braRecoPaths: string[] = [];
      let idsPaths: string[] = [];
      let fintrackerPaths: string[] = [];
      let otherDocsPaths: string[] = [];

      if (braRecoFiles.length > 0) {
        braRecoPaths = await uploadSubmissionFiles(braRecoFiles, user.id, 'buyer/bra_reco');
      }
      if (idsFiles.length > 0) {
        idsPaths = await uploadSubmissionFiles(idsFiles, user.id, 'buyer/ids');
      }
      if (fintrackerFiles.length > 0) {
        fintrackerPaths = await uploadSubmissionFiles(fintrackerFiles, user.id, 'buyer/fintracker');
      }
      if (otherDocsFiles.length > 0) {
        otherDocsPaths = await uploadSubmissionFiles(otherDocsFiles, user.id, 'buyer/other_docs');
      }

      const selectedAgent = agents.find(a => a.id === data.agent_id);
      
      const { error } = await supabase.from('submissions').insert({
        form_type: 'buyer',
        user_id: user.id,
        agent_name: selectedAgent?.full_name || '',
        submission_type: data.submission_type,
        client_name: data.client_name,
        lender_name_contact: data.lender_name_contact || null,
        closing_date: data.closing_date || null,
        condition_due_sbp: data.condition_due_sbp || null,
        condition_due_financing: data.condition_due_financing || null,
        condition_due_status: data.condition_due_status || null,
        condition_due_home_inspection: data.condition_due_home_inspection || null,
        condition_due_other: data.condition_due_other || null,
        condition_other_description: data.condition_other_description || null,
        notes: data.notes || null,
        client_occupation: data.client_occupation || null,
        firm_price: data.firm_price ? parseFloat(data.firm_price) : null,
        conditional_price: data.conditional_price ? parseFloat(data.conditional_price) : null,
        cooperating_commission: data.cooperating_commission || null,
        bra_reco_files: braRecoPaths,
        ids_files: idsPaths,
        fintracker_files: fintrackerPaths,
        other_docs_files: otherDocsPaths,
      });

      if (error) throw error;

      toast.success('Buyer submission created successfully!');
      form.reset();
      setBraRecoFiles([]);
      setIdsFiles([]);
      setFintrackerFiles([]);
      setOtherDocsFiles([]);
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
        <CardTitle>Buyers</CardTitle>
        <CardDescription>when a buyer is purchasing a home with us</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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

              <FormField
                control={form.control}
                name="agent_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agent Name *</FormLabel>
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
            </div>

            <FormField
              control={form.control}
              name="client_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter client name" {...field} />
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

            <FormField
              control={form.control}
              name="closing_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Closing Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Condition Due Dates Section */}
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <h4 className="font-medium text-sm">Condition Due Dates</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="condition_due_sbp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Condition Due - SBP</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="condition_due_financing"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Condition Due - Financing</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="condition_due_status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Condition Due - Status</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="condition_due_home_inspection"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Condition Due - Home Inspection</FormLabel>
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
                name="condition_due_other"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condition Due - Other</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {conditionDueOther && (
                <FormField
                  control={form.control}
                  name="condition_other_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>If Other - Input Here</FormLabel>
                      <FormControl>
                        <Input placeholder="Describe the other condition" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Enter your answer" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firm_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Firm Price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="conditional_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conditional Price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="cooperating_commission"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cooperating Commission</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter cooperating commission" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* File Upload Sections */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>BRA/RECO GUIDE</Label>
                <FileUpload files={braRecoFiles} setFiles={setBraRecoFiles} />
              </div>

              <div className="space-y-2">
                <Label>I.DS</Label>
                <FileUpload files={idsFiles} setFiles={setIdsFiles} />
              </div>

              <div className="space-y-2">
                <Label>Completed Fintracker</Label>
                <FileUpload files={fintrackerFiles} setFiles={setFintrackerFiles} />
              </div>

              <div className="space-y-2">
                <Label>Other Docs (Amendments etc.)</Label>
                <FileUpload files={otherDocsFiles} setFiles={setOtherDocsFiles} />
              </div>
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
