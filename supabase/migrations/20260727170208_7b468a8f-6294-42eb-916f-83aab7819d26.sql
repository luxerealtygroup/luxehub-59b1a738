ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS asana_task_gid text,
  ADD COLUMN IF NOT EXISTS asana_task_url text,
  ADD COLUMN IF NOT EXISTS asana_pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS asana_attachments_sent integer,
  ADD COLUMN IF NOT EXISTS asana_attachments_uploaded integer;