import { useState, useEffect, useCallback } from 'react';
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
import { followUpBossApi } from '@/lib/api/followUpBoss';
import { ImageThumbnail } from '@/components/ImageThumbnail';
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
  Presentation,
  User,
  Loader2,
  FileCheck,
  Briefcase
} from 'lucide-react';
import { format } from 'date-fns';
import { FUBPerson } from '@/lib/api/followUpBoss';

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
  fub_person_id: number | null;
}

interface ImportantDocument {
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

interface AgentDocument {
  id: string;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  category: string;
  user_id: string;
  created_at: string;
}

const agentCategories = [
  { value: 'personal', label: 'Personal Files' },
  { value: 'notes', label: 'Notes' },
  { value: 'templates', label: 'My Templates' },
  { value: 'reference', label: 'Reference Materials' },
  { value: 'general', label: 'General' },
];

const trainingCategories = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'scripts', label: 'Scripts & Dialogues' },
  { value: 'contracts', label: 'Contracts & Legal' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'systems', label: 'Systems & Tools' },
  { value: 'general', label: 'General' },
];

const importantCategories = [
  { value: 'policies', label: 'Policies & Procedures' },
  { value: 'forms', label: 'Forms & Templates' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'general', label: 'General' },
];

// Sanitize file names for storage - remove special characters that cause issues
const sanitizeFileName = (fileName: string): string => {
  return fileName
    .replace(/[–—]/g, '-') // Replace em/en dashes with regular dash
    .replace(/[()[\]{}]/g, '') // Remove brackets and parentheses
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace other special chars with underscore
    .replace(/_+/g, '_'); // Collapse multiple underscores
};

// Document folder categories
const documentFolders = [
  { value: 'listing', label: 'Listing Documents' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'offers', label: 'Offers' },
  { value: 'buyer', label: 'Buyer Documents' },
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
  const [importantDocs, setImportantDocs] = useState<ImportantDocument[]>([]);
  const [agentDocs, setAgentDocs] = useState<AgentDocument[]>([]);
  const [selectedAgentCategory, setSelectedAgentCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedImportantCategory, setSelectedImportantCategory] = useState<string>('all');
  const [selectedDocumentFolder, setSelectedDocumentFolder] = useState<string>('all');
  
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
    document_type: 'listing',
    file: null as File | null,
  });
  
  // Bulk upload state
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<Array<{
    file: File;
    folder: string;
  }>>([]);
  
  // FUB person search (for upload dialog) - now supports multiple clients
  const [fubSearchQuery, setFubSearchQuery] = useState('');
  const [fubSearchResults, setFubSearchResults] = useState<FUBPerson[]>([]);
  const [selectedFubPeople, setSelectedFubPeople] = useState<FUBPerson[]>([]);
  const [fubSearching, setFubSearching] = useState(false);
  
  // Client filter for viewing documents
  const [clientFilterQuery, setClientFilterQuery] = useState('');
  const [clientFilterResults, setClientFilterResults] = useState<FUBPerson[]>([]);
  const [selectedClientFilter, setSelectedClientFilter] = useState<FUBPerson | null>(null);
  const [clientFilterSearching, setClientFilterSearching] = useState(false);
  
  // Important doc upload form
  const [importantDialogOpen, setImportantDialogOpen] = useState(false);
  const [importantForm, setImportantForm] = useState({
    title: '',
    description: '',
    category: 'general',
    file: null as File | null,
  });
  
  // Agent doc upload form
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [agentForm, setAgentForm] = useState({
    title: '',
    description: '',
    category: 'general',
    file: null as File | null,
  });
  const [selectedAgentForUpload, setSelectedAgentForUpload] = useState<{ id: string; full_name: string } | null>(null);
  const [teamProfiles, setTeamProfiles] = useState<Array<{ id: string; full_name: string | null }>>([]);

  // Debounced FUB search for upload dialog
  const searchFubPeople = useCallback(async (query: string) => {
    if (query.length < 2) {
      setFubSearchResults([]);
      return;
    }
    
    setFubSearching(true);
    try {
      const response = await followUpBossApi.searchPeople(query);
      if (response.success && response.data?.people) {
        setFubSearchResults(response.data.people.slice(0, 10));
      }
    } catch (error) {
      console.error('FUB search error:', error);
    } finally {
      setFubSearching(false);
    }
  }, []);

  // Debounced FUB search for client filter
  const searchClientFilter = useCallback(async (query: string) => {
    if (query.length < 2) {
      setClientFilterResults([]);
      return;
    }
    
    setClientFilterSearching(true);
    try {
      const response = await followUpBossApi.searchPeople(query);
      if (response.success && response.data?.people) {
        setClientFilterResults(response.data.people.slice(0, 10));
      }
    } catch (error) {
      console.error('Client filter search error:', error);
    } finally {
      setClientFilterSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (fubSearchQuery) {
        searchFubPeople(fubSearchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [fubSearchQuery, searchFubPeople]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (clientFilterQuery) {
        searchClientFilter(clientFilterQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [clientFilterQuery, searchClientFilter]);

  useEffect(() => {
    if (user) {
      fetchDocuments();
      if (isAdmin) {
        fetchTeamProfiles();
      }
    }
  }, [user, isAdmin]);

  const fetchTeamProfiles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .order('full_name', { ascending: true });
    setTeamProfiles(data || []);
  };

  const fetchDocuments = async () => {
    if (!user) return;
    setLoading(true);
    
    const [trainingRes, clientRes, importantRes, agentRes] = await Promise.all([
      supabase.from('training_documents').select('*').order('created_at', { ascending: false }),
      supabase.from('client_documents').select('*').order('created_at', { ascending: false }),
      supabase.from('important_documents' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('agent_documents' as any).select('*').order('created_at', { ascending: false }),
    ]);
    
    setTrainingDocs((trainingRes.data || []) as TrainingDocument[]);
    setClientDocs((clientRes.data || []) as ClientDocument[]);
    setImportantDocs((importantRes.data || []) as unknown as ImportantDocument[]);
    setAgentDocs((agentRes.data || []) as unknown as AgentDocument[]);
    setLoading(false);
  };

  const uploadTrainingDoc = async () => {
    if (!user || !trainingForm.file) return;
    setUploading(true);
    
    try {
      const file = trainingForm.file;
      const filePath = `${Date.now()}_${sanitizeFileName(file.name)}`;
      
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
    if (!user || !clientForm.file || selectedFubPeople.length === 0) return;
    setUploading(true);
    
    try {
      const file = clientForm.file;
      const filePath = `${user.id}/${Date.now()}_${sanitizeFileName(file.name)}`;
      
      // Upload file once
      const { error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      // Create a record for each selected client
      const insertPromises = selectedFubPeople.map(person => 
        supabase.from('client_documents').insert({
          title: clientForm.title,
          description: clientForm.description || null,
          file_path: filePath,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          client_name: person.name,
          document_type: clientForm.document_type,
          uploaded_by: user.id,
          fub_person_id: person.id,
        })
      );
      
      const results = await Promise.all(insertPromises);
      const errors = results.filter(r => r.error);
      
      if (errors.length > 0) {
        console.error('Some client records failed:', errors);
      }
      
      const clientNames = selectedFubPeople.map(p => p.name).join(', ');
      toast({ 
        title: 'Success', 
        description: `Document uploaded for ${selectedFubPeople.length > 1 ? 'clients' : 'client'}: ${clientNames}` 
      });
      setClientDialogOpen(false);
      setClientForm({ title: '', description: '', document_type: 'listing', file: null });
      setSelectedFubPeople([]);
      setFubSearchQuery('');
      setFubSearchResults([]);
      fetchDocuments();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const uploadBulkClientDocs = async () => {
    if (!user || bulkFiles.length === 0 || selectedFubPeople.length === 0) return;
    setUploading(true);
    
    try {
      let successCount = 0;
      let errorCount = 0;
      
      for (const item of bulkFiles) {
        try {
          const filePath = `${user.id}/${Date.now()}_${sanitizeFileName(item.file.name)}`;
          
          const { error: uploadError } = await supabase.storage
            .from('client-documents')
            .upload(filePath, item.file);
          
          if (uploadError) throw uploadError;
          
          // Use filename without extension as title
          const titleFromName = item.file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          
          // Create records for each selected client
          for (const person of selectedFubPeople) {
            const { error: dbError } = await supabase.from('client_documents').insert({
              title: titleFromName,
              description: null,
              file_path: filePath,
              file_name: item.file.name,
              file_type: item.file.type,
              file_size: item.file.size,
              client_name: person.name,
              document_type: item.folder,
              uploaded_by: user.id,
              fub_person_id: person.id,
            });
            
            if (dbError) throw dbError;
          }
          successCount++;
        } catch (e) {
          console.error('Failed to upload:', item.file.name, e);
          errorCount++;
        }
      }
      
      if (successCount > 0) {
        const clientCount = selectedFubPeople.length;
        toast({ 
          title: 'Upload Complete', 
          description: `${successCount} document${successCount > 1 ? 's' : ''} uploaded for ${clientCount} client${clientCount > 1 ? 's' : ''}${errorCount > 0 ? `, ${errorCount} failed` : ''}!` 
        });
      }
      if (errorCount > 0 && successCount === 0) {
        toast({ title: 'Error', description: 'All uploads failed', variant: 'destructive' });
      }
      
      setBulkDialogOpen(false);
      setBulkFiles([]);
      setSelectedFubPeople([]);
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

  const deleteDocument = async (type: 'training' | 'client' | 'important' | 'agent', id: string, filePath: string) => {
    const bucketMap = { training: 'training-library', client: 'client-documents', important: 'important-documents', agent: 'agent-documents' };
    const tableMap = { training: 'training_documents', client: 'client_documents', important: 'important_documents', agent: 'agent_documents' } as const;
    const bucket = bucketMap[type];
    const table = tableMap[type];
    
    try {
      await supabase.storage.from(bucket).remove([filePath]);
      if (type === 'important' || type === 'agent') {
        await supabase.from(table as any).delete().eq('id', id);
      } else {
        await supabase.from(table as 'training_documents' | 'client_documents').delete().eq('id', id);
      }
      toast({ title: 'Deleted', description: 'Document removed' });
      fetchDocuments();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const uploadImportantDoc = async () => {
    if (!user || !importantForm.file) return;
    setUploading(true);
    
    try {
      const file = importantForm.file;
      const filePath = `${Date.now()}_${sanitizeFileName(file.name)}`;
      
      const { error: uploadError } = await supabase.storage
        .from('important-documents')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      const { error: dbError } = await (supabase.from('important_documents' as any)).insert({
        title: importantForm.title,
        description: importantForm.description || null,
        file_path: filePath,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        category: importantForm.category,
        uploaded_by: user.id,
      });
      
      if (dbError) throw dbError;
      
      toast({ title: 'Success', description: 'Important document uploaded!' });
      setImportantDialogOpen(false);
      setImportantForm({ title: '', description: '', category: 'general', file: null });
      fetchDocuments();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const uploadAgentDoc = async () => {
    if (!user || !agentForm.file) return;
    
    // Determine target user: if admin selected an agent, use that; otherwise use current user
    const targetUserId = (isAdmin && selectedAgentForUpload) ? selectedAgentForUpload.id : user.id;
    
    setUploading(true);
    
    try {
      const file = agentForm.file;
      const filePath = `${targetUserId}/${Date.now()}_${sanitizeFileName(file.name)}`;
      
      const { error: uploadError } = await supabase.storage
        .from('agent-documents')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      const { error: dbError } = await (supabase.from('agent_documents' as any)).insert({
        title: agentForm.title,
        description: agentForm.description || null,
        file_path: filePath,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        category: agentForm.category,
        user_id: targetUserId,
      });
      
      if (dbError) throw dbError;
      
      const targetName = selectedAgentForUpload?.full_name || 'your';
      toast({ title: 'Success', description: `Document uploaded to ${targetName}'s documents!` });
      setAgentDialogOpen(false);
      setAgentForm({ title: '', description: '', category: 'general', file: null });
      setSelectedAgentForUpload(null);
      fetchDocuments();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const filteredTrainingDocs = trainingDocs.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredClientDocs = clientDocs.filter(doc => {
    // Must match client filter if selected
    if (selectedClientFilter && doc.fub_person_id !== selectedClientFilter.id) {
      return false;
    }
    // Must match folder filter if selected
    if (selectedDocumentFolder !== 'all' && doc.document_type !== selectedDocumentFolder) {
      return false;
    }
    // Must match search if there's a search query
    if (searchQuery) {
      return doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const filteredImportantDocs = importantDocs.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedImportantCategory === 'all' || doc.category === selectedImportantCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredAgentDocs = agentDocs.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedAgentCategory === 'all' || doc.category === selectedAgentCategory;
    return matchesSearch && matchesCategory;
  });

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
          <TabsTrigger value="important" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FileCheck className="h-4 w-4 mr-2" /> Important Documents
          </TabsTrigger>
          <TabsTrigger value="clients" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FolderOpen className="h-4 w-4 mr-2" /> Client Documents
          </TabsTrigger>
          <TabsTrigger value="agent" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Briefcase className="h-4 w-4 mr-2" /> My Documents
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
          {/* Client Selection / Filter */}
          <Card className="border-primary/20">
            <CardContent className="pt-4">
              <div className="flex flex-col gap-4">
                <Label className="text-sm font-medium">Select a Client to View Documents</Label>
                {selectedClientFilter ? (
                  <div className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/30 rounded-lg">
                    <User className="h-6 w-6 text-primary" />
                    <div className="flex-1">
                      <p className="font-medium">{selectedClientFilter.name}</p>
                      {selectedClientFilter.emails?.[0] && (
                        <p className="text-sm text-muted-foreground">{selectedClientFilter.emails[0].value}</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedClientFilter(null);
                        setClientFilterQuery('');
                      }}
                    >
                      Change Client
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search for a client..."
                        value={clientFilterQuery}
                        onChange={(e) => setClientFilterQuery(e.target.value)}
                        className="pl-10"
                      />
                      {clientFilterSearching && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {clientFilterResults.length > 0 && (
                      <div className="border rounded-lg max-h-64 overflow-y-auto bg-background">
                        {clientFilterResults.map(person => (
                          <button
                            key={person.id}
                            type="button"
                            onClick={() => {
                              setSelectedClientFilter(person);
                              setClientFilterResults([]);
                              setClientFilterQuery('');
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b last:border-b-0 flex items-center gap-3"
                          >
                            <User className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{person.name}</p>
                              {person.emails?.[0] && (
                                <p className="text-sm text-muted-foreground">{person.emails[0].value}</p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {clientFilterQuery.length >= 2 && clientFilterResults.length === 0 && !clientFilterSearching && (
                      <p className="text-sm text-muted-foreground text-center py-2">No clients found</p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {selectedClientFilter && (
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex gap-2 flex-1 w-full sm:w-auto">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={selectedDocumentFolder} onValueChange={setSelectedDocumentFolder}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Folder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Folders</SelectItem>
                    {documentFolders.map(folder => (
                      <SelectItem key={folder.value} value={folder.value}>{folder.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            
            <Dialog open={clientDialogOpen} onOpenChange={(open) => {
              setClientDialogOpen(open);
              // Pre-select the filtered client when opening the dialog
              if (open && selectedClientFilter && selectedFubPeople.length === 0) {
                setSelectedFubPeople([selectedClientFilter]);
              }
              if (!open) {
                setSelectedFubPeople([]);
                setFubSearchQuery('');
                setFubSearchResults([]);
              }
            }}>
              <DialogTrigger asChild>
                <Button className="bg-primary text-primary-foreground">
                  <Upload className="h-4 w-4 mr-2" /> Upload Doc for {selectedClientFilter ? selectedClientFilter.name : 'Client'}
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
                    <Label>FUB Client(s) * <span className="text-xs text-muted-foreground">(select multiple for shared documents)</span></Label>
                    {/* Selected clients as chips */}
                    {selectedFubPeople.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {selectedFubPeople.map(person => (
                          <Badge 
                            key={person.id} 
                            variant="secondary" 
                            className="flex items-center gap-1 bg-green-500/10 text-green-700 border border-green-500/30"
                          >
                            <User className="h-3 w-3" />
                            {person.name}
                            <button
                              type="button"
                              onClick={() => setSelectedFubPeople(prev => prev.filter(p => p.id !== person.id))}
                              className="ml-1 hover:text-red-500"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    {/* Search to add more clients */}
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search to add client..."
                          value={fubSearchQuery}
                          onChange={(e) => setFubSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                        {fubSearching && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      {fubSearchResults.length > 0 && (
                        <div className="border rounded-lg max-h-48 overflow-y-auto">
                          {fubSearchResults
                            .filter(person => !selectedFubPeople.some(p => p.id === person.id))
                            .map(person => (
                              <button
                                key={person.id}
                                type="button"
                                onClick={() => {
                                  setSelectedFubPeople(prev => [...prev, person]);
                                  setFubSearchQuery('');
                                  setFubSearchResults([]);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-b-0"
                              >
                                <p className="font-medium text-sm">{person.name}</p>
                                {person.emails?.[0] && (
                                  <p className="text-xs text-muted-foreground">{person.emails[0].value}</p>
                                )}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Document Type</Label>
                    <Select value={clientForm.document_type} onValueChange={(v) => setClientForm({ ...clientForm, document_type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {documentFolders.map(type => (
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
                    disabled={uploading || !clientForm.title || selectedFubPeople.length === 0 || !clientForm.file}
                    className="w-full"
                  >
                    {uploading ? 'Uploading...' : selectedFubPeople.length > 1 ? `Upload for ${selectedFubPeople.length} Clients` : 'Upload'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Bulk Upload Dialog */}
            <Dialog open={bulkDialogOpen} onOpenChange={(open) => {
              setBulkDialogOpen(open);
              if (open && selectedClientFilter && selectedFubPeople.length === 0) {
                setSelectedFubPeople([selectedClientFilter]);
              }
              if (!open) {
                setBulkFiles([]);
                setSelectedFubPeople([]);
                setFubSearchQuery('');
                setFubSearchResults([]);
              }
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-primary text-primary">
                  <FolderOpen className="h-4 w-4 mr-2" /> Bulk Upload
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Bulk Upload Documents</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>FUB Client(s) * <span className="text-xs text-muted-foreground">(select multiple for shared documents)</span></Label>
                    {/* Selected clients as chips */}
                    {selectedFubPeople.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {selectedFubPeople.map(person => (
                          <Badge 
                            key={person.id} 
                            variant="secondary" 
                            className="flex items-center gap-1 bg-green-500/10 text-green-700 border border-green-500/30"
                          >
                            <User className="h-3 w-3" />
                            {person.name}
                            <button
                              type="button"
                              onClick={() => setSelectedFubPeople(prev => prev.filter(p => p.id !== person.id))}
                              className="ml-1 hover:text-red-500"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    {/* Search to add more clients */}
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search to add client..."
                          value={fubSearchQuery}
                          onChange={(e) => setFubSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                        {fubSearching && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      {fubSearchResults.length > 0 && (
                        <div className="border rounded-lg max-h-48 overflow-y-auto">
                          {fubSearchResults
                            .filter(person => !selectedFubPeople.some(p => p.id === person.id))
                            .map(person => (
                              <button
                                key={person.id}
                                type="button"
                                onClick={() => {
                                  setSelectedFubPeople(prev => [...prev, person]);
                                  setFubSearchQuery('');
                                  setFubSearchResults([]);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-b-0"
                              >
                                <p className="font-medium text-sm">{person.name}</p>
                                {person.emails?.[0] && (
                                  <p className="text-xs text-muted-foreground">{person.emails[0].value}</p>
                                )}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Select Files *</Label>
                    <Input
                      type="file"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setBulkFiles(files.map(file => ({ file, folder: 'listing' })));
                      }}
                    />
                    <p className="text-xs text-muted-foreground">Select multiple files at once</p>
                  </div>

                  {bulkFiles.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Assign Folders to Each Document</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Set all to:</span>
                          <Select 
                            onValueChange={(v) => {
                              setBulkFiles(bulkFiles.map(item => ({ ...item, folder: v })));
                            }}
                          >
                            <SelectTrigger className="w-28 h-8 text-xs">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {documentFolders.map(type => (
                                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                        {bulkFiles.map((item, index) => {
                          const FileIcon = getFileIcon(item.file.type);
                          const isImage = item.file.type.startsWith('image/');
                          return (
                            <div key={index} className="flex items-center gap-3 p-3">
                              {isImage ? (
                                <img 
                                  src={URL.createObjectURL(item.file)} 
                                  alt={item.file.name}
                                  className="h-10 w-10 object-cover rounded shrink-0"
                                />
                              ) : (
                                <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{item.file.name}</p>
                                <p className="text-xs text-muted-foreground">{formatFileSize(item.file.size)}</p>
                              </div>
                              <Select 
                                value={item.folder} 
                                onValueChange={(v) => {
                                  const updated = [...bulkFiles];
                                  updated[index] = { ...item, folder: v };
                                  setBulkFiles(updated);
                                }}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {documentFolders.map(type => (
                                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setBulkFiles(bulkFiles.filter((_, i) => i !== index));
                                }}
                                className="text-destructive hover:text-destructive shrink-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <Button 
                    onClick={uploadBulkClientDocs} 
                    disabled={uploading || bulkFiles.length === 0 || selectedFubPeople.length === 0}
                    className="w-full"
                  >
                    {uploading ? 'Uploading...' : selectedFubPeople.length > 1 
                      ? `Upload ${bulkFiles.length} Document${bulkFiles.length !== 1 ? 's' : ''} for ${selectedFubPeople.length} Clients`
                      : `Upload ${bulkFiles.length} Document${bulkFiles.length !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          )}

          {!selectedClientFilter ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <User className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Search for a client above</p>
                <p className="text-sm text-muted-foreground">Select a client to view and manage their documents</p>
              </CardContent>
            </Card>
          ) : filteredClientDocs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No documents for {selectedClientFilter.name}</p>
                <p className="text-sm text-muted-foreground">Upload documents for this client using the button above</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Images Grid */}
              {filteredClientDocs.some(doc => doc.file_type?.startsWith('image/')) && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Photos</h3>
                  <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {filteredClientDocs
                      .filter(doc => doc.file_type?.startsWith('image/'))
                      .map(doc => (
                        <Card key={doc.id} className="border-primary/10 hover:border-primary/30 transition-colors overflow-hidden group">
                          <div className="relative">
                            <ImageThumbnail 
                              bucket="client-documents"
                              filePath={doc.file_path}
                              alt={doc.title}
                              className="h-32 w-full object-cover"
                            />
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => downloadDocument('client-documents', doc.file_path, doc.file_name)}
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                onClick={() => deleteDocument('client', doc.id, doc.file_path)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <CardContent className="p-2">
                            <p className="text-xs font-medium truncate">{doc.title}</p>
                            <div className="flex items-center justify-between mt-1">
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {documentFolders.find(t => t.value === doc.document_type)?.label || doc.document_type}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">{formatFileSize(doc.file_size)}</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </div>
              )}

              {/* Documents List */}
              {filteredClientDocs.some(doc => !doc.file_type?.startsWith('image/')) && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Documents</h3>
                  <div className="border rounded-lg divide-y bg-card">
                    {filteredClientDocs
                      .filter(doc => !doc.file_type?.startsWith('image/'))
                      .map(doc => {
                        const FileIcon = getFileIcon(doc.file_type);
                        return (
                          <div key={doc.id} className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors">
                            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <FileIcon className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{doc.title}</p>
                              <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                            </div>
                            <Badge variant="outline" className="text-xs shrink-0 hidden sm:inline-flex">
                              {documentFolders.find(t => t.value === doc.document_type)?.label || doc.document_type}
                            </Badge>
                            <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">
                              {formatFileSize(doc.file_size)}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0 hidden lg:inline">
                              {format(new Date(doc.created_at), 'MMM d, yyyy')}
                            </span>
                            <div className="flex gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => downloadDocument('client-documents', doc.file_path, doc.file_name)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                onClick={() => deleteDocument('client', doc.id, doc.file_path)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* IMPORTANT DOCUMENTS TAB */}
        <TabsContent value="important" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-1 w-full sm:w-auto">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search important docs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedImportantCategory} onValueChange={setSelectedImportantCategory}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {importantCategories.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {isAdmin && (
              <Dialog open={importantDialogOpen} onOpenChange={setImportantDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary text-primary-foreground">
                    <Upload className="h-4 w-4 mr-2" /> Upload Important Doc
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Important Document</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Title *</Label>
                      <Input
                        placeholder="Document title"
                        value={importantForm.title}
                        onChange={(e) => setImportantForm({ ...importantForm, title: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        placeholder="Brief description..."
                        value={importantForm.description}
                        onChange={(e) => setImportantForm({ ...importantForm, description: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={importantForm.category} onValueChange={(v) => setImportantForm({ ...importantForm, category: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {importantCategories.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>File *</Label>
                      <Input
                        type="file"
                        onChange={(e) => setImportantForm({ ...importantForm, file: e.target.files?.[0] || null })}
                      />
                    </div>
                    <Button 
                      onClick={uploadImportantDoc} 
                      disabled={uploading || !importantForm.title || !importantForm.file}
                      className="w-full"
                    >
                      {uploading ? 'Uploading...' : 'Upload'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {filteredImportantDocs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileCheck className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No important documents yet</p>
                <p className="text-sm text-muted-foreground">
                  {isAdmin ? 'Upload company-wide important documents' : 'Important documents will appear here'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredImportantDocs.map(doc => {
                const FileIcon = getFileIcon(doc.file_type);
                return (
                  <Card key={doc.id} className="border-blue-500/10 hover:border-blue-500/30 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <FileIcon className="h-5 w-5 text-blue-600" />
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
                            {importantCategories.find(c => c.value === doc.category)?.label || doc.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => downloadDocument('important-documents', doc.file_path, doc.file_name)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteDocument('important', doc.id, doc.file_path)}
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

        {/* AGENT DOCUMENTS TAB (My Documents) */}
        <TabsContent value="agent" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-1 w-full sm:w-auto">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search my documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedAgentCategory} onValueChange={setSelectedAgentCategory}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {agentCategories.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Dialog open={agentDialogOpen} onOpenChange={(open) => {
              setAgentDialogOpen(open);
              if (!open) {
                setSelectedAgentForUpload(null);
              }
            }}>
              <DialogTrigger asChild>
                <Button className="bg-primary text-primary-foreground">
                  <Upload className="h-4 w-4 mr-2" /> {isAdmin ? 'Upload Document' : 'Upload My Document'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{isAdmin ? 'Upload Agent Document' : 'Upload Personal Document'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {isAdmin && (
                    <div className="space-y-2">
                      <Label>Upload For Agent *</Label>
                      <Select 
                        value={selectedAgentForUpload?.id || ''} 
                        onValueChange={(v) => {
                          const profile = teamProfiles.find(p => p.id === v);
                          setSelectedAgentForUpload(profile ? { id: profile.id, full_name: profile.full_name || 'Unknown' } : null);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select an agent..." />
                        </SelectTrigger>
                        <SelectContent>
                          {teamProfiles.map(profile => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.full_name || 'Unknown Agent'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Input
                      placeholder="Document title"
                      value={agentForm.title}
                      onChange={(e) => setAgentForm({ ...agentForm, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      placeholder="Brief description..."
                      value={agentForm.description}
                      onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={agentForm.category} onValueChange={(v) => setAgentForm({ ...agentForm, category: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {agentCategories.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>File *</Label>
                    <Input
                      type="file"
                      onChange={(e) => setAgentForm({ ...agentForm, file: e.target.files?.[0] || null })}
                    />
                  </div>
                  <Button 
                    onClick={uploadAgentDoc} 
                    disabled={uploading || !agentForm.title || !agentForm.file || (isAdmin && !selectedAgentForUpload)}
                    className="w-full"
                  >
                    {uploading ? 'Uploading...' : 'Upload'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {filteredAgentDocs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No personal documents yet</p>
                <p className="text-sm text-muted-foreground">Upload your private files, notes, and templates</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Image documents as thumbnails */}
              {(() => {
                const imageDocs = filteredAgentDocs.filter(doc => doc.file_type?.includes('image'));
                const nonImageDocs = filteredAgentDocs.filter(doc => !doc.file_type?.includes('image'));
                
                return (
                  <div className="space-y-6">
                    {/* Image thumbnails grid */}
                    {imageDocs.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-3">Images</h3>
                        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                          {imageDocs.map(doc => (
                            <Card key={doc.id} className="border-amber-500/10 hover:border-amber-500/30 transition-colors overflow-hidden">
                              <div className="aspect-square relative">
                                <ImageThumbnail
                                  bucket="agent-documents"
                                  filePath={doc.file_path}
                                  alt={doc.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <CardContent className="p-2">
                                <p className="text-xs font-medium truncate">{doc.title}</p>
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</span>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() => downloadDocument('agent-documents', doc.file_path, doc.file_name)}
                                    >
                                      <Download className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                      onClick={() => deleteDocument('agent', doc.id, doc.file_path)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Non-image documents as list */}
                    {nonImageDocs.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-3">Documents</h3>
                        <div className="space-y-2">
                          {nonImageDocs.map(doc => {
                            const FileIcon = getFileIcon(doc.file_type);
                            return (
                              <div 
                                key={doc.id} 
                                className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/10 hover:border-amber-500/30 bg-card transition-colors"
                              >
                                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                                  <FileIcon className="h-5 w-5 text-amber-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{doc.title}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="truncate">{doc.file_name}</span>
                                    <span>•</span>
                                    <span>{formatFileSize(doc.file_size)}</span>
                                    <span>•</span>
                                    <span>{format(new Date(doc.created_at), 'MMM d, yyyy')}</span>
                                  </div>
                                </div>
                                <Badge variant="secondary" className="text-xs flex-shrink-0">
                                  {agentCategories.find(c => c.value === doc.category)?.label || doc.category}
                                </Badge>
                                <div className="flex gap-1 flex-shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => downloadDocument('agent-documents', doc.file_path, doc.file_name)}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteDocument('agent', doc.id, doc.file_path)}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Library;