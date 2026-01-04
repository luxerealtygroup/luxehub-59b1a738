-- Drop the current INSERT policy for client-documents
DROP POLICY IF EXISTS "Users can upload client document files" ON storage.objects;

-- Create updated INSERT policy that allows uploads where user_id is in folder path
-- Path can be: {userId}/... OR submissions/{formType}/{userId}/...
CREATE POLICY "Users can upload client document files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'client-documents' 
  AND (
    -- Original pattern: userId as first folder
    (auth.uid())::text = (storage.foldername(name))[1]
    OR 
    -- Submissions pattern: submissions/formType/userId/...
    (
      (storage.foldername(name))[1] = 'submissions' 
      AND (auth.uid())::text = (storage.foldername(name))[3]
    )
  )
);

-- Also update the SELECT policy to allow viewing submissions
DROP POLICY IF EXISTS "Users can view their client document files" ON storage.objects;

CREATE POLICY "Users can view their client document files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'client-documents' 
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR 
    (
      (storage.foldername(name))[1] = 'submissions' 
      AND (auth.uid())::text = (storage.foldername(name))[3]
    )
  )
);

-- Also update the DELETE policy
DROP POLICY IF EXISTS "Users can delete their client document files" ON storage.objects;

CREATE POLICY "Users can delete their client document files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'client-documents' 
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR 
    (
      (storage.foldername(name))[1] = 'submissions' 
      AND (auth.uid())::text = (storage.foldername(name))[3]
    )
  )
);