-- Allow clients to download files from client-documents bucket
CREATE POLICY "Clients can download their documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'client-documents' 
  AND EXISTS (
    SELECT 1 FROM public.client_accounts ca
    JOIN public.client_documents cd ON (
      ca.fub_person_id = cd.fub_person_id
      OR LOWER(ca.email) = LOWER(cd.client_name)
    )
    WHERE ca.user_id = auth.uid()
    AND cd.file_path = name
  )
);