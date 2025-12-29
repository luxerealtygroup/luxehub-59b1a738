-- Create agent_documents table for personal agent files
CREATE TABLE public.agent_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_documents ENABLE ROW LEVEL SECURITY;

-- Agents can only see their own documents
CREATE POLICY "Users can view their own agent documents"
ON public.agent_documents
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own agent documents"
ON public.agent_documents
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agent documents"
ON public.agent_documents
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own agent documents"
ON public.agent_documents
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_agent_documents_updated_at
BEFORE UPDATE ON public.agent_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for agent documents
INSERT INTO storage.buckets (id, name, public) VALUES ('agent-documents', 'agent-documents', false);

-- Storage policies - agents can only access their own folder
CREATE POLICY "Users can view their own agent documents"
ON storage.objects
FOR SELECT
USING (bucket_id = 'agent-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own agent documents"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'agent-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own agent documents"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'agent-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own agent documents"
ON storage.objects
FOR DELETE
USING (bucket_id = 'agent-documents' AND auth.uid()::text = (storage.foldername(name))[1]);