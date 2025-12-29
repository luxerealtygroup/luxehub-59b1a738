-- Create important_documents table
CREATE TABLE public.important_documents (
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

-- Enable RLS
ALTER TABLE public.important_documents ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view important documents
CREATE POLICY "All users can view important documents"
ON public.important_documents
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admins can insert important documents
CREATE POLICY "Admins can insert important documents"
ON public.important_documents
FOR INSERT
WITH CHECK (is_admin_or_owner(auth.uid()));

-- Only admins can update important documents
CREATE POLICY "Admins can update important documents"
ON public.important_documents
FOR UPDATE
USING (is_admin_or_owner(auth.uid()));

-- Only admins can delete important documents
CREATE POLICY "Admins can delete important documents"
ON public.important_documents
FOR DELETE
USING (is_admin_or_owner(auth.uid()));

-- Create storage bucket for important documents
INSERT INTO storage.buckets (id, name, public) VALUES ('important-documents', 'important-documents', false);

-- Storage policies for important documents bucket
CREATE POLICY "All users can view important documents storage"
ON storage.objects
FOR SELECT
USING (bucket_id = 'important-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admins can upload important documents storage"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'important-documents' AND is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can update important documents storage"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'important-documents' AND is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can delete important documents storage"
ON storage.objects
FOR DELETE
USING (bucket_id = 'important-documents' AND is_admin_or_owner(auth.uid()));