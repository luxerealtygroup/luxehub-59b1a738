import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { FileText, Download, FolderOpen, Home, Calendar, CheckSquare, MessageCircle, ShoppingCart, Tag } from 'lucide-react';
import { format } from 'date-fns';
import { TransactionTimeline } from './components/TransactionTimeline';
import { ClientTaskList } from './components/ClientTaskList';
import { ClientMessaging } from './components/ClientMessaging';
import { PropertyDetails } from './components/PropertyDetails';
import { ClientSidebar } from './components/ClientSidebar';

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
}

const ClientDashboard = () => {
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [clientAccount, setClientAccount] = useState<ClientAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
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
      const [docsResult, transactionsResult] = await Promise.all([
        docsQuery,
        supabase
          .from('client_transactions')
          .select('*')
          .eq('client_account_id', account.id)
          .order('created_at', { ascending: false })
      ]);

      if (docsResult.error) {
        console.error('Error fetching documents:', docsResult.error);
      } else {
        setDocuments(docsResult.data || []);
      }

      if (transactionsResult.error) {
        console.error('Error fetching transactions:', transactionsResult.error);
      } else {
        setTransactions((transactionsResult.data || []) as Transaction[]);
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

  const activeTransaction = transactions.find(t => t.status === 'active' || t.status === 'pending');

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            {activeTransaction ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <PropertyDetails transaction={activeTransaction} />
                <div className="space-y-6">
                  <TransactionTimeline transaction={activeTransaction} />
                  {clientAccount && (
                    <ClientTaskList clientAccountId={clientAccount.id} />
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
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{documents.length}</p>
                      <p className="text-sm text-muted-foreground">Documents</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10">
                      <Home className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{transactions.length}</p>
                      <p className="text-sm text-muted-foreground">Transactions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
                      <Calendar className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {activeTransaction?.closing_date 
                          ? format(new Date(activeTransaction.closing_date), 'MMM d')
                          : 'TBD'
                        }
                      </p>
                      <p className="text-sm text-muted-foreground">Closing Date</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case 'purchase':
        return purchaseTransaction ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <ShoppingCart className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Your Purchase</h2>
                <p className="text-sm text-muted-foreground">{purchaseTransaction.property_address}</p>
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <PropertyDetails transaction={purchaseTransaction} />
              <TransactionTimeline transaction={purchaseTransaction} />
            </div>
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <ShoppingCart className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No Purchase Transaction</h3>
              <p className="text-muted-foreground text-center max-w-md">
                Your agent will add your purchase details here when you're buying a property.
              </p>
            </CardContent>
          </Card>
        );

      case 'sale':
        return saleTransaction ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <Tag className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Your Sale</h2>
                <p className="text-sm text-muted-foreground">{saleTransaction.property_address}</p>
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <PropertyDetails transaction={saleTransaction} />
              <TransactionTimeline transaction={saleTransaction} />
            </div>
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Tag className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No Sale Transaction</h3>
              <p className="text-muted-foreground text-center max-w-md">
                Your agent will add your sale details here when you're selling a property.
              </p>
            </CardContent>
          </Card>
        );

      case 'tasks':
        return clientAccount && (
          <ClientTaskList clientAccountId={clientAccount.id} />
        );

      case 'documents':
        return (
          <div className="space-y-6">
            {documents.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <FolderOpen className="h-16 w-16 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No documents yet</h3>
                  <p className="text-muted-foreground text-center max-w-md">
                    Your agent will upload documents here when they're ready for you to review.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-8">
                {Object.entries(groupedDocuments).map(([type, docs]) => (
                  <div key={type}>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getDocumentTypeColor(type)}`}>
                        {type}
                      </span>
                      <span className="text-muted-foreground text-sm font-normal">
                        ({docs.length} {docs.length === 1 ? 'document' : 'documents'})
                      </span>
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {docs.map((doc) => (
                        <Card key={doc.id} className="hover:border-primary/30 transition-colors">
                          <CardHeader className="pb-3">
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                <FileText className="h-5 w-5 text-primary" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <CardTitle className="text-base font-medium truncate">
                                  {doc.title}
                                </CardTitle>
                                <p className="text-xs text-muted-foreground truncate">
                                  {doc.file_name}
                                </p>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                              <span>{formatFileSize(doc.file_size)}</span>
                              <span>{format(new Date(doc.created_at), 'MMM d, yyyy')}</span>
                            </div>
                            <Button 
                              onClick={() => handleDownload(doc)} 
                              className="w-full gap-2"
                              variant="outline"
                            >
                              <Download className="h-4 w-4" />
                              Download
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'messages':
        return clientAccount && (
          <ClientMessaging 
            clientAccountId={clientAccount.id} 
            userId={clientAccount.user_id}
          />
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
      case 'messages': return <MessageCircle className="h-5 w-5" />;
      default: return <Home className="h-5 w-5" />;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <ClientSidebar 
          activeTab={activeTab}
          onTabChange={setActiveTab}
          clientName={clientAccount?.full_name || null}
          clientEmail={clientAccount?.email || ''}
          onSignOut={handleSignOut}
          hasPurchase={!!purchaseTransaction}
          hasSale={!!saleTransaction}
        />
        
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
            <div className="px-6 py-4 flex items-center gap-4">
              <SidebarTrigger />
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {getPageIcon()}
                </div>
                <h1 className="font-display text-xl font-semibold">{getPageTitle()}</h1>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-6">
            {renderContent()}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ClientDashboard;
