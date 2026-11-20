import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Receipt, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/utils';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { canSendInvoiceToSlack, invoiceSlackStatus } from './accountsPayableSlack';

interface AccountsPayableProps {
  className?: string;
}

interface InvoiceRow { id:string; vendor_name:string|null; property_address:string|null; invoice_amount:number|null; invoice_date:string|null; created_at:string; slack_posted_at:string|null; slack_error:string|null }

/** Accounts Payable from invoice submissions delivered to Slack #accounting. */
const AccountsPayable = ({ className }: AccountsPayableProps) => {
  const { orgId } = useTenant();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const load = async () => {
    if (!orgId) return;
    setLoading(true); setError(null);
    const { data, error: qErr } = await supabase.from('submissions')
      .select('id,vendor_name,property_address,invoice_amount,invoice_date,created_at,slack_posted_at,slack_error')
      .eq('org_id', orgId).eq('form_type', 'invoice')
      .order('created_at', { ascending: false }).limit(25);
    if (qErr) setError(qErr.message); else setRows((data ?? []) as InvoiceRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [orgId]);

  const send = async (id: string) => {
    setSending(id);
    const { data, error: fnErr } = await supabase.functions.invoke('slack-post-submission', { body: { action: 'post', submission_id: id } });
    setSending(null);
    if (fnErr || data?.ok === false || data?.error) toast.error(`Slack: ${fnErr?.message ?? data?.error ?? 'post failed'}`);
    else if (data?.skipped) toast.warning('No #accounting destination is configured.');
    else toast.success('Sent to #accounting');
    load();
  };

  const total = rows.reduce((sum, r) => sum + (Number(r.invoice_amount) || 0), 0);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5 text-gold" />
            Accounts Payable
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={load}>Refresh</Button>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <div className="text-2xl font-bold text-gold">{formatCurrency(total)}</div>
          <Badge variant="secondary">{rows.length} invoices</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
        ) : error ? (
          <div className="text-center py-4 text-destructive"><AlertCircle className="h-8 w-8 mx-auto mb-2" /><p>{error}</p></div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No invoice submissions yet</p>
            ) : rows.map((r) => {
              const status = invoiceSlackStatus(r);
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{r.vendor_name || r.property_address || 'Invoice'}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.invoice_date ? `Invoice ${format(parseISO(r.invoice_date), 'MMM d, yyyy')} · ` : ''}Submitted {format(parseISO(r.created_at), 'MMM d, yyyy')}
                    </span>
                    <div className="mt-1 flex items-center gap-2">
                      {status === 'posted' && <Badge variant="secondary">Posted to #accounting</Badge>}
                      {status === 'error' && <Badge variant="destructive" title={r.slack_error ?? ''}>Slack error</Badge>}
                      {status === 'not_posted' && <Badge variant="outline">Not posted</Badge>}
                      {canSendInvoiceToSlack(r) && (
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={sending === r.id} onClick={() => send(r.id)}>
                          {sending === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Send to #accounting'}
                        </Button>
                      )}
                    </div>
                  </div>
                  {r.invoice_amount != null && <div className="text-right font-semibold">{formatCurrency(Number(r.invoice_amount))}</div>}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AccountsPayable;

