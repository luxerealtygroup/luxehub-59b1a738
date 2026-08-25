import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { FileText, Download, FolderOpen, Home, Calendar, CheckSquare, MessageCircle, ShoppingCart, Tag, ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { TransactionTimeline } from './components/TransactionTimeline';
import { ClientTaskList } from './components/ClientTaskList';
import { PortalChatPanel } from '@/components/portal/PortalChatPanel';
import { PropertyDetails } from './components/PropertyDetails';
import { ClientSidebar } from './components/ClientSidebar';
import { FUBTimeline } from './components/FUBTimeline';
import { PortalDocumentsPanel } from '@/components/portal/PortalDocumentsPanel';
import { PortalPhotosPanel } from '@/components/portal/PortalPhotosPanel';
import { SupportChatWidget } from '@/components/support/SupportChatWidget';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingCart as ShoppingCartIcon, Tag as TagIcon } from 'lucide-react';
import { ClientNotificationsBell } from './components/ClientNotificationsBell';

interface ClientDocument {
  id: string;
  title: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  document_type: string | null;
  created_at: string;
  fub_person_id: number | null;
}

interface ClientAccount {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  fub_person_id: number | null;
  drive_folder_id?: string | null;
}

interface Transaction {
  id: string;
  property_address: string;
  transaction_type: string;
  status: string;
  list_price: number | null;
  sale_price: number | null;
  offer_date: string | null;
  acceptance_date: string | null;
  inspection_date: string | null;
  appraisal_date: string | null;
  financing_deadline: string | null;
  closing_date: string | null;
  property_photos: string[];
  property_description: string | null;
  deal_id?: string | null;
  fub_deal_id?: number | null;
  drive_folder_id?: string | null;
}

const ClientDashboard = () => {
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [clientAccount, setClientAccount] = useState<ClientAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkAuthAndFetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/client-portal/login');
        return;
      }

      // Check if user is a client
      const { data: account, error: accountError } = await supabase
        .from('client_accounts')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (accountError || !account) {
        await supabase.auth.signOut();
        navigate('/client-portal/login');
        return;
      }

      setClientAccount(account);

      // Build document query - filter by fub_person_id if available, or client_name
      let docsQuery = supabase
        .from('client_documents')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Filter documents to only show those for this client
      if (account.fub_person_id) {
        docsQuery = docsQuery.eq('fub_person_id', account.fub_person_id);
      } else if (account.full_name) {
        docsQuery = docsQuery.ilike('client_name', `%${account.full_name}%`);
      }

      // Fetch data in parallel
      const [docsResult, transactionsResult, pipelineResult] = await Promise.all([
        docsQuery,
        supabase
          .from('client_transactions')
          .select('*')
          .eq('client_account_id', account.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('pipeline_clients')
          .select('id, client_type, property_address, property_interest, expected_pending_date, projected_sale_amount, status, created_at')
          .eq('email', account.email.toLowerCase()),
      ]);

      if (docsResult.error) {
        console.error('Error fetching documents:', docsResult.error);
      } else {
        setDocuments(docsResult.data || []);
      }

      if (transactionsResult.error) {
        console.error('Error fetching transactions:', transactionsResult.error);
      } else {
        const txs = (transactionsResult.data || []) as Transaction[];

        // Option 2: auto-detect both sides from the pipeline. If the client's
        // email has a buyer AND a seller entry in pipeline_clients, ensure the
        // portal renders both sections regardless of client_type on the
        // account. We synthesize a lightweight transaction row for any side
        // that isn't already represented in client_transactions.
        const pipelineRows = (pipelineResult?.data || []) as Array<{
          id: string;
          client_type: string | null;
          property_address: string | null;
          property_interest: string | null;
          expected_pending_date: string | null;
          projected_sale_amount: number | null;
          status: string | null;
          created_at: string;
        }>;

        const hasBuyerTx = txs.some(t => t.transaction_type === 'buyer' || t.transaction_type === 'purchase');
        const hasSellerTx = txs.some(t => t.transaction_type === 'seller' || t.transaction_type === 'listing' || t.transaction_type === 'sale');
        const buyerPipeline = pipelineRows.find(p => (p.client_type || '').toLowerCase() === 'buyer');
        const sellerPipeline = pipelineRows.find(p => ['seller', 'listing'].includes((p.client_type || '').toLowerCase()));

        const synthetic: Transaction[] = [];
        const synth = (row: typeof pipelineRows[number], type: 'buyer' | 'seller'): Transaction => ({
          id: `pipeline-${row.id}`,
          property_address: row.property_address || row.property_interest || (type === 'buyer' ? 'Property search in progress' : 'Listing in progress'),
          transaction_type: type,
          status: row.status || 'pending',
          list_price: type === 'seller' ? row.projected_sale_amount ?? null : null,
          sale_price: null,
          offer_date: null,
          acceptance_date: null,
          inspection_date: null,
          appraisal_date: null,
          financing_deadline: null,
          closing_date: row.expected_pending_date ?? null,
          property_photos: [],
          property_description: null,
          deal_id: null,
          fub_deal_id: null,
          drive_folder_id: null,
        });
        if (buyerPipeline && !hasBuyerTx) synthetic.push(synth(buyerPipeline, 'buyer'));
        if (sellerPipeline && !hasSellerTx) synthetic.push(synth(sellerPipeline, 'seller'));

        const merged = [...txs, ...synthetic];
        setTransactions(merged);
        // Prefer an active transaction, otherwise the most recent
        const preferred = merged.find(t => t.status === 'active' || t.status === 'pending') || merged[0];
        if (preferred) setSelectedTransactionId(preferred.id);
      }

      setLoading(false);
    };

    checkAuthAndFetchData();
  }, [navigate, toast]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/client-portal/login');
  };

  const handleDownload = async (doc: ClientDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('client-documents')
        .download(doc.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDocumentTypeColor = (type: string | null) => {
    switch (type?.toLowerCase()) {
      case 'listing documents':
      case 'listing':
        return 'bg-blue-500/10 text-blue-600';
      case 'marketing':
        return 'bg-purple-500/10 text-purple-600';
      case 'offers':
        return 'bg-green-500/10 text-green-600';
      case 'buyer documents':
      case 'buyer':
        return 'bg-orange-500/10 text-orange-600';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Group documents by type
  const groupedDocuments = documents.reduce((acc, doc) => {
    const type = doc.document_type || 'Other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(doc);
    return acc;
  }, {} as Record<string, ClientDocument[]>);

  // Separate transactions by type
  const purchaseTransaction = transactions.find(t => 
    t.transaction_type === 'buyer' || t.transaction_type === 'purchase'
  );
  const saleTransaction = transactions.find(t => 
    t.transaction_type === 'seller' || t.transaction_type === 'listing' || t.transaction_type === 'sale'
  );

  const selectedTransaction =
    transactions.find(t => t.id === selectedTransactionId) ||
    transactions.find(t => t.status === 'active' || t.status === 'pending') ||
    transactions[0] ||
    null;
  const activeTransaction = selectedTransaction;

  // Documents scoped to the selected transaction when it has a linked deal
  const scopedDocuments = selectedTransaction?.deal_id
    ? documents.filter(d => (d as unknown as { deal_id?: string }).deal_id === selectedTransaction.deal_id)
    : documents;

  const groupedScopedDocuments = scopedDocuments.reduce((acc, doc) => {
    const type = doc.document_type || 'Other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(doc);
    return acc;
  }, {} as Record<string, ClientDocument[]>);

  const txLabel = (t: Transaction) => {
    const type = t.transaction_type;
    const isBuy = type === 'buyer' || type === 'purchase';
    const isSell = type === 'seller' || type === 'listing' || type === 'sale';
    const prefix = isBuy ? 'My Purchase' : isSell ? 'My Sale' : 'My Transaction';
    return `${prefix} — ${t.property_address || 'Property'}`;
  };
  const txIcon = (t: Transaction) => {
    const isBuy = t.transaction_type === 'buyer' || t.transaction_type === 'purchase';
    return isBuy ? <ShoppingCartIcon className="h-4 w-4" /> : <TagIcon className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen surface-canvas p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            {clientAccount?.fub_person_id ? (
              <div className="grid gap-6 lg:grid-cols-2">
                {activeTransaction ? (
                  <PropertyDetails transaction={activeTransaction} />
                ) : (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16">
                      <Home className="h-16 w-16 text-muted-foreground/50 mb-4" />
                      <h3 className="text-lg font-medium mb-2">Property details coming soon</h3>
                      <p className="text-muted-foreground text-center max-w-md">
                        Your agent will add property details here as your transaction progresses.
                      </p>
                    </CardContent>
                  </Card>
                )}
                <div className="space-y-6">
                  <FUBTimeline
                    fubPersonId={clientAccount.fub_person_id}
                    clientAccountId={clientAccount.id}
                    fubDealId={selectedTransaction?.fub_deal_id ?? null}
                    transactionId={selectedTransaction?.id ?? null}
                  />
                  <ClientTaskList
                    clientAccountId={clientAccount.id}
                    transactionId={selectedTransaction?.id ?? null}
                  />
                </div>
              </div>
            ) : activeTransaction ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <PropertyDetails transaction={activeTransaction} />
                <div className="space-y-6">
                  <TransactionTimeline transaction={activeTransaction} />
                  {clientAccount && (
                    <ClientTaskList
                      clientAccountId={clientAccount.id}
                      transactionId={selectedTransaction?.id ?? null}
                    />
                  )}
                </div>
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Home className="h-16 w-16 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Active Transactions</h3>
                  <p className="text-muted-foreground text-center max-w-md">
                    Your agent will add your transaction details here once you're under contract.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Quick Stats */}
            <div className="grid gap-5 md:grid-cols-3">
              {[
                { label: 'Documents', value: String(documents.length), icon: <FileText className="h-5 w-5" />, gradient: 'from-primary/10', accent: 'text-primary' },
                { label: 'Transactions', value: String(transactions.length), icon: <Home className="h-5 w-5" />, gradient: 'from-emerald-500/10', accent: 'text-emerald-600' },
                { label: 'Closing Date', value: activeTransaction?.closing_date ? format(new Date(activeTransaction.closing_date), 'MMM d') : 'TBD', icon: <Calendar className="h-5 w-5" />, gradient: 'from-primary/10', accent: 'text-primary' },
              ].map((s) => (
                <div key={s.label} className="luxe-card p-6 relative overflow-hidden">
                  <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient} to-transparent opacity-60 pointer-events-none`} />
                  <div className="relative flex items-start justify-between">
                    <div>
                      <p className="eyebrow">{s.label}</p>
                      <p className="mt-2 font-display text-3xl font-semibold tracking-tight">{s.value}</p>
                    </div>
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-background/70 border border-border/60 ${s.accent}`}>
                      {s.icon}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'purchase':
        return purchaseTransaction ? (
          <div className="space-y-6">
            <SectionHeader
              eyebrow="Transaction"
              title="Your Purchase"
              subtitle={purchaseTransaction.property_address}
              icon={<ShoppingCart className="h-5 w-5" />}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <PropertyDetails transaction={purchaseTransaction} />
              <TransactionTimeline transaction={purchaseTransaction} />
            </div>
          </div>
        ) : (
          <EmptyStateCard icon={<ShoppingCart className="h-8 w-8" />} title="No Purchase Transaction" description="Your agent will add your purchase details here when you're buying a property." />
        );

      case 'sale':
        return saleTransaction ? (
          <div className="space-y-6">
            <SectionHeader
              eyebrow="Transaction"
              title="Your Sale"
              subtitle={saleTransaction.property_address}
              icon={<Tag className="h-5 w-5" />}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <PropertyDetails transaction={saleTransaction} />
              <TransactionTimeline transaction={saleTransaction} />
            </div>
          </div>
        ) : (
          <EmptyStateCard icon={<Tag className="h-8 w-8" />} title="No Sale Transaction" description="Your agent will add your sale details here when you're selling a property." />
        );

      case 'tasks':
        return clientAccount && (
          <ClientTaskList
            clientAccountId={clientAccount.id}
            transactionId={selectedTransaction?.id ?? null}
          />
        );

      case 'documents':
        return clientAccount ? (
          <PortalDocumentsPanel portalId={clientAccount.id} canManage={false} />
        ) : null;

      case 'photos':
        return clientAccount ? (
          <PortalPhotosPanel portalId={clientAccount.id} canManage={false} />
        ) : null;

      case 'messages':
        return clientAccount && (
          <PortalChatPanel portalId={clientAccount.id} viewerRole="client" />
        );

      default:
        return null;
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'overview': return 'Overview';
      case 'purchase': return 'Your Purchase';
      case 'sale': return 'Your Sale';
      case 'tasks': return 'Tasks';
      case 'documents': return 'Documents';
      case 'photos': return 'Photos';
      case 'messages': return 'Messages';
      default: return 'Dashboard';
    }
  };

  const getPageIcon = () => {
    switch (activeTab) {
      case 'overview': return <Home className="h-5 w-5" />;
      case 'purchase': return <ShoppingCart className="h-5 w-5" />;
      case 'sale': return <Tag className="h-5 w-5" />;
      case 'tasks': return <CheckSquare className="h-5 w-5" />;
      case 'documents': return <FileText className="h-5 w-5" />;
      case 'photos': return <ImageIcon className="h-5 w-5" />;
      case 'messages': return <MessageCircle className="h-5 w-5" />;
      default: return <Home className="h-5 w-5" />;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <ClientSidebar 
          activeTab={activeTab}
          onTabChange={setActiveTab}
          clientName={clientAccount?.full_name || null}
          clientEmail={clientAccount?.email || ''}
          onSignOut={handleSignOut}
          hasPurchase={!!purchaseTransaction}
          hasSale={!!saleTransaction}
        />
        
        <div className="flex-1 flex flex-col surface-canvas">
          {/* Header */}
          <header className="border-b border-border/60 bg-background/70 backdrop-blur-xl sticky top-0 z-10">
            <div className="px-4 sm:px-8 py-5 flex items-center gap-4">
              <SidebarTrigger className="md:hidden" />
              <div className="flex items-center gap-3 min-w-0">
                <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  {getPageIcon()}
                </div>
                <div className="min-w-0">
                  <p className="eyebrow leading-none">Client Portal</p>
                  <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight leading-tight mt-1 truncate">
                    {getPageTitle()}
                  </h1>
                </div>
              </div>
              {transactions.length > 1 && activeTab !== 'messages' && (
                <div className="ml-auto flex items-center gap-2 min-w-0">
                  <span className="eyebrow hidden md:inline">Transaction</span>
                  <Select
                    value={selectedTransactionId ?? undefined}
                    onValueChange={(v) => setSelectedTransactionId(v)}
                  >
                    <SelectTrigger className="h-11 min-w-[220px] sm:min-w-[280px] rounded-full border-border/70 bg-background shadow-sm hover:border-primary/40 focus:ring-2 focus:ring-primary/30 transition-colors">
                      <SelectValue placeholder="Select a transaction" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {transactions.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="rounded-lg">
                          <span className="flex items-center gap-2">
                            <span className="text-primary">{txIcon(t)}</span>
                            {txLabel(t)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ClientNotificationsBell onOpenTab={(tab) => setActiveTab(tab)} />
                </div>
              )}
              {!(transactions.length > 1 && activeTab !== 'messages') && (
                <div className="ml-auto">
                  <ClientNotificationsBell onOpenTab={(tab) => setActiveTab(tab)} />
                </div>
              )}
            </div>
            <div className="h-px divider-hair" />
          </header>

          {/* Main Content */}
          <main className="flex-1 px-4 sm:px-8 py-6 sm:py-10">
            <div className="max-w-6xl mx-auto animate-fade-in">
              {renderContent()}
            </div>
          </main>
        </div>
        <SupportChatWidget userType="client" />
      </div>
    </SidebarProvider>
  );
};

export default ClientDashboard;

function SectionHeader({
  eyebrow,
  title,
  subtitle,
  icon,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string | null;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex items-start gap-4">
      {icon && (
        <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-1">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1 truncate">{subtitle}</p>}
      </div>
    </div>
  );
}

function EmptyStateCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="luxe-card p-12 flex flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 mb-5">
        {icon}
      </div>
      <h3 className="font-display text-xl font-semibold tracking-tight mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md leading-relaxed">{description}</p>
    </div>
  );
}
