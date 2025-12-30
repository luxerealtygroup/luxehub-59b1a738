-- Drop existing insert policy
DROP POLICY IF EXISTS "Users can insert their own agent documents" ON public.agent_documents;

-- Create new insert policy that allows users to insert their own OR admins to insert for anyone
CREATE POLICY "Users can insert agent documents" 
ON public.agent_documents 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id 
  OR is_admin_or_owner(auth.uid())
);

-- Also update SELECT policy so admins can see all agent documents
DROP POLICY IF EXISTS "Users can view their own agent documents" ON public.agent_documents;

CREATE POLICY "Users can view agent documents" 
ON public.agent_documents 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR is_admin_or_owner(auth.uid())
);

-- Update storage policies to allow admins to upload to any agent's folder
CREATE POLICY "Admins can upload agent documents for any user" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'agent-documents' 
  AND is_admin_or_owner(auth.uid())
);

CREATE POLICY "Admins can view all agent documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'agent-documents' 
  AND is_admin_or_owner(auth.uid())
);

CREATE POLICY "Admins can delete any agent documents" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'agent-documents' 
  AND is_admin_or_owner(auth.uid())
);