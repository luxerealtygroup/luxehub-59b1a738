import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  BookOpen, 
  FileText, 
  Upload, 
  Download, 
  Trash2, 
  Search,
  FolderOpen,
  File,
  Image,
  FileSpreadsheet,
  Presentation
} from 'lucide-react';
import { format } from 'date-fns';

interface TrainingDocument {
  id: string;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  category: string;
  uploaded_by: string;
  created_at: string;
}

interface ClientDocument {
  id: string;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  client_name: string;
  deal_id: string | null;
  document_type: string;
  uploaded_by: string;
  created_at: string;
}

const trainingCategories = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'scripts', label: 'Scripts & Dialogues' },
  { value: 'contracts', label: 'Contracts & Legal' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'systems', label: 'Systems & Tools' },
  { value: 'general', label: 'General' },
];

const documentTypes = [
  { value: 'contract', label: 'Contract' },
  { value: 'listing_agreement', label: 'Listing Agreement' },
  { value: 'buyer_representation', label: 'Buyer Representation' },
  { value: 'disclosure', label: 'Disclosure' },
  { value: 'inspection', label: 'Inspection Report' },
  { value: 'appraisal', label: 'Appraisal' },
  { value: 'other', label: 'Other' },
];

const getFileIcon = (fileType: string | null) => {
  if (!fileType) return File;
  if (fileType.includes('image')) return Image;
  if (fileType.includes('spreadsheet') || fileType.includes('excel')) return FileSpreadsheet;
  if (fileType.includes('presentation') || fileType.includes('powerpoint')) return Presentation;
  return FileText;
};

const formatFileSize = (bytes: number | null) => {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const Library = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  
  const [trainingDocs, setTrainingDocs] = useState<TrainingDocument[]>([]);
  const [clientDocs, setClientDocs] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Training upload form
  const [trainingDialogOpen, setTrainingDialogOpen] = useState(false);
  const [trainingForm, setTrainingForm] = useState({
    title: '',
    description: '',
    category: 'general',
    file: null as File | null,
  });
  
  // Client doc upload form
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [clientForm, setClientForm] = useState({
    title: '',
    description: '',
    client_name: '',
    document_type: 'contract',
    file: null as File | null,
  });

  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [user]);

  const fetchDocuments = async () => {
    if (!user) return;
    setLoading(true);
    
    const [trainingRes, clientRes] = await Promise.all([
      supabase.from('training_documents').select('*').order('created_at', { ascending: false }),
      supabase.from('client_documents').select('*').order('created_at', { ascending: false }),
    ]);
    
    setTrainingDocs((trainingRes.data || []) as TrainingDocument[]);
    setClientDocs((clientRes.data || []) as ClientDocument[]);
    setLoading(false);
  };

  const uploadTrainingDoc = async () => {
    if (!user || !trainingForm.file) return;
    setUploading(true);
    
    try {
      const file = trainingForm.file;
      const filePath = `${Date.now()}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('training-library')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      const { error: dbError } = await supabase.from('training_documents').insert({
        title: trainingForm.title,
        description: trainingForm.description || null,
        file_path: filePath,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        category: trainingForm.category,
        uploaded_by: user.id,
      });
      
      if (dbError) throw dbError;
      
      toast({ title: 'Success', description: 'Training document uploaded!' });
      setTrainingDialogOpen(false);
      setTrainingForm({ title: '', description: '', category: 'general', file: null });
      fetchDocuments();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const uploadClientDoc = async () => {
    if (!user || !clientForm.file) return;
    setUploading(true);
    
    try {
      const file = clientForm.file;
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      const { error: dbError } = await supabase.from('client_documents').insert({
        title: clientForm.title,
        description: clientForm.description || null,
        file_path: filePath,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        client_name: clientForm.client_name,
        document_type: clientForm.document_type,
        uploaded_by: user.id,
      });
      
      if (dbError) throw dbError;
      
      toast({ title: 'Success', description: 'Client document uploaded!' });
      setClientDialogOpen(false);
      setClientForm({ title: '', description: '', client_name: '', document_type: 'contract', file: null });
      fetchDocuments();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const downloadDocument = async (bucket: string, filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    
    if (error) {
      toast({ title: 'Error', description: 'Failed to download file', variant: 'destructive' });
      return;
    }
    
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteDocument = async (type: 'training' | 'client', id: string, filePath: string) => {
    const bucket = type === 'training' ? 'training-library' : 'client-documents';
    const table = type === 'training' ? 'training_documents' : 'client_documents';
    
    try {
      await supabase.storage.from(bucket).remove([filePath]);
      await supabase.from(table).delete().eq('id', id);
      toast({ title: 'Deleted', description: 'Document removed' });
      fetchDocuments();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const filteredTrainingDocs = trainingDocs.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredClientDocs = clientDocs.filter(doc => 
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-primary animate-pulse">Loading library...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Document Library</h1>
          <p className="text-muted-foreground mt-1">Training materials & client documents</p>
        </div>
      </div>

      <Tabs defaultValue="training" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="training" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BookOpen className="h-4 w-4 mr-2" /> Training Library
          </TabsTrigger>
          <TabsTrigger value="clients" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FolderOpen className="h-4 w-4 mr-2" /> Client Documents
          </TabsTrigger>
        </TabsList>

        {/* TRAINING LIBRARY TAB */}
        <TabsContent value="training" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-1 w-full sm:w-auto">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search training docs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {trainingCategories.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Dialog open={trainingDialogOpen} onOpenChange={setTrainingDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary text-primary-foreground">
                  <Upload className="h-4 w-4 mr-2" /> Upload Training Doc
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Training Document</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Input
                      placeholder="Document title"
                      value={trainingForm.title}
                      onChange={(e) => setTrainingForm({ ...trainingForm, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      placeholder="Brief description..."
                      value={trainingForm.description}
                      onChange={(e) => setTrainingForm({ ...trainingForm, description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={trainingForm.category} onValueChange={(v) => setTrainingForm({ ...trainingForm, category: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {trainingCategories.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>File *</Label>
                    <Input
                      type="file"
                      onChange={(e) => setTrainingForm({ ...trainingForm, file: e.target.files?.[0] || null })}
                    />
                  </div>
                  <Button 
                    onClick={uploadTrainingDoc} 
                    disabled={uploading || !trainingForm.title || !trainingForm.file}
                    className="w-full"
                  >
                    {uploading ? 'Uploading...' : 'Upload'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {filteredTrainingDocs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No training documents yet</p>
                <p className="text-sm text-muted-foreground">Upload your first document to get started</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredTrainingDocs.map(doc => {
                const FileIcon = getFileIcon(doc.file_type);
                return (
                  <Card key={doc.id} className="border-primary/10 hover:border-primary/30 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FileIcon className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-sm font-medium truncate">{doc.title}</CardTitle>
                            <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {doc.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{doc.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {trainingCategories.find(c => c.value === doc.category)?.label || doc.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => downloadDocument('training-library', doc.file_path, doc.file_name)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {(isAdmin || doc.uploaded_by === user?.id) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteDocument('training', doc.id, doc.file_path)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {format(new Date(doc.created_at), 'MMM d, yyyy')}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* CLIENT DOCUMENTS TAB */}
        <TabsContent value="clients" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by client name or document..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary text-primary-foreground">
                  <Upload className="h-4 w-4 mr-2" /> Upload Client Doc
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Client Document</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Input
                      placeholder="Document title"
                      value={clientForm.title}
                      onChange={(e) => setClientForm({ ...clientForm, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Client Name *</Label>
                    <Input
                      placeholder="Client name"
                      value={clientForm.client_name}
                      onChange={(e) => setClientForm({ ...clientForm, client_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Document Type</Label>
                    <Select value={clientForm.document_type} onValueChange={(v) => setClientForm({ ...clientForm, document_type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {documentTypes.map(type => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      placeholder="Brief description..."
                      value={clientForm.description}
                      onChange={(e) => setClientForm({ ...clientForm, description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>File *</Label>
                    <Input
                      type="file"
                      onChange={(e) => setClientForm({ ...clientForm, file: e.target.files?.[0] || null })}
                    />
                  </div>
                  <Button 
                    onClick={uploadClientDoc} 
                    disabled={uploading || !clientForm.title || !clientForm.client_name || !clientForm.file}
                    className="w-full"
                  >
                    {uploading ? 'Uploading...' : 'Upload'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {filteredClientDocs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No client documents yet</p>
                <p className="text-sm text-muted-foreground">Upload documents for your clients and transactions</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredClientDocs.map(doc => {
                const FileIcon = getFileIcon(doc.file_type);
                return (
                  <Card key={doc.id} className="border-primary/10 hover:border-primary/30 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <FileIcon className="h-5 w-5 text-green-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-sm font-medium truncate">{doc.title}</CardTitle>
                            <p className="text-xs text-muted-foreground truncate">{doc.client_name}</p>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground mb-2 truncate">{doc.file_name}</p>
                      {doc.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{doc.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {documentTypes.find(t => t.value === doc.document_type)?.label || doc.document_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => downloadDocument('client-documents', doc.file_path, doc.file_name)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteDocument('client', doc.id, doc.file_path)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {format(new Date(doc.created_at), 'MMM d, yyyy')}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Library;