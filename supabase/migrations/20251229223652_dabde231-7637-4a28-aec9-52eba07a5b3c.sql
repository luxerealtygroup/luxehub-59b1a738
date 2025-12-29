-- Create storage buckets for documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('training-library', 'training-library', false);

INSERT INTO storage.buckets (id, name, public) 
VALUES ('client-documents', 'client-documents', false);

-- Create training documents table
CREATE TABLE public.training_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  category TEXT DEFAULT 'general',
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create client documents table
CREATE TABLE public.client_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  client_name TEXT NOT NULL,
  deal_id UUID,
  document_type TEXT DEFAULT 'contract',
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.training_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

-- Training documents: All authenticated users can view, anyone can upload
CREATE POLICY "All users can view training documents"
  ON public.training_documents FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "All users can insert training documents"
  ON public.training_documents FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Users can update their own training documents"
  ON public.training_documents FOR UPDATE
  USING (auth.uid() = uploaded_by OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can delete training documents"
  ON public.training_documents FOR DELETE
  USING (is_admin_or_owner(auth.uid()));

-- Client documents: Own documents + admins can see all
CREATE POLICY "Users can view client documents"
  ON public.client_documents FOR SELECT
  USING (auth.uid() = uploaded_by OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can insert client documents"
  ON public.client_documents FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Users can update their own client documents"
  ON public.client_documents FOR UPDATE
  USING (auth.uid() = uploaded_by OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can delete their own client documents"
  ON public.client_documents FOR DELETE
  USING (auth.uid() = uploaded_by OR is_admin_or_owner(auth.uid()));

-- Storage policies for training-library bucket
CREATE POLICY "Authenticated users can view training files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'training-library' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload training files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'training-library' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete training files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'training-library' AND is_admin_or_owner(auth.uid()));

-- Storage policies for client-documents bucket
CREATE POLICY "Users can view their client document files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'client-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can view all client document files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'client-documents' AND is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can upload client document files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'client-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their client document files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'client-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can delete any client document files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'client-documents' AND is_admin_or_owner(auth.uid()));

-- Add triggers for updated_at
CREATE TRIGGER update_training_documents_updated_at
  BEFORE UPDATE ON public.training_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_documents_updated_at
  BEFORE UPDATE ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();