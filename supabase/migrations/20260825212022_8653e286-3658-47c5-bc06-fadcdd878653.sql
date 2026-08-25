ALTER TABLE public.portal_documents
  ADD COLUMN IF NOT EXISTS fub_attachment_id BIGINT,
  ADD COLUMN IF NOT EXISTS fub_pushed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fub_push_error TEXT;