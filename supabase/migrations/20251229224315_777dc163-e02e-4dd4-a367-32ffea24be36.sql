-- Add fub_person_id column to client_documents
ALTER TABLE public.client_documents 
ADD COLUMN fub_person_id INTEGER;