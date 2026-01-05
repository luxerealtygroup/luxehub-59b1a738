-- Drop existing storage policies for client-documents bucket and recreate with proper path support
DROP POLICY IF EXISTS "Users can upload their own client documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own client documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own client documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own client documents" ON storage.objects;
DROP POLICY IF EXISTS "Agents can upload client documents" ON storage.objects;
DROP POLICY IF EXISTS "Agents can view client documents" ON storage.objects;
DROP POLICY IF EXISTS "Agents can update client documents" ON storage.objects;
DROP POLICY IF EXISTS "Agents can delete client documents" ON storage.objects;

-- Create new policies that support nested submission paths
-- Pattern: submissions/{formType}/{subCategory}/{userId}/... OR submissions/{formType}/{userId}/...

CREATE POLICY "Agents can upload client documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-documents' 
  AND auth.uid() IS NOT NULL
  AND (
    -- Support nested paths like submissions/buyer/other_docs/{userId}/file.pdf
    (storage.foldername(name))[1] = 'submissions'
    AND auth.uid()::text = ANY(string_to_array(name, '/'))
  )
);

CREATE POLICY "Agents can view client documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'client-documents'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Agents can update client documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'client-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'submissions'
  AND auth.uid()::text = ANY(string_to_array(name, '/'))
);

CREATE POLICY "Agents can delete client documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'client-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'submissions'
  AND auth.uid()::text = ANY(string_to_array(name, '/'))
);