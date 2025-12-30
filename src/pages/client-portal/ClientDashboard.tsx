import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { FileText, Download, LogOut, User, FolderOpen } from 'lucide-react';
import { format } from 'date-fns';

interface ClientDocument {
  id: string;
  title: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  document_type: string | null;
  created_at: string;
}

interface ClientAccount {
  id: string;
  email: string;
  full_name: string | null;
  fub_person_id: number | null;
}

const ClientDashboard = () => {
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [clientAccount, setClientAccount] = useState<ClientAccount | null>(null);
  const [loading, setLoading] = useState(true);
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

      // Fetch client documents
      const { data: docs, error: docsError } = await supabase
        .from('client_documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (docsError) {
        console.error('Error fetching documents:', docsError);
        toast({
          title: "Error loading documents",
          description: docsError.message,
          variant: "destructive"
        });
      } else {
        setDocuments(docs || []);
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
        return 'bg-blue-500/10 text-blue-600';
      case 'marketing':
        return 'bg-purple-500/10 text-purple-600';
      case 'offers':
        return 'bg-green-500/10 text-green-600';
      case 'buyer documents':
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold">
                {clientAccount?.full_name || 'Client Portal'}
              </h1>
              <p className="text-sm text-muted-foreground">{clientAccount?.email}</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-display font-semibold mb-2">Your Documents</h2>
          <p className="text-muted-foreground">
            Access and download all documents related to your real estate transactions.
          </p>
        </div>

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
      </main>
    </div>
  );
};

export default ClientDashboard;
