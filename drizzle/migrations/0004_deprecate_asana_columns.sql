-- Values backed up 2026-11-20 to backup_asana_20261120.asana_values (632 rows) before drop.
-- Direct drop was blocked by the backward-incompatible-migration setting; columns are retired here and can be dropped once that setting allows it.
COMMENT ON COLUMN public.submissions.asana_task_gid IS 'DEPRECATED: Asana removed; replaced by slack_ts';
COMMENT ON COLUMN public.submissions.asana_task_url IS 'DEPRECATED: Asana removed; replaced by slack_ts';
COMMENT ON COLUMN public.submissions.asana_pushed_at IS 'DEPRECATED: Asana removed; replaced by slack_posted_at';
COMMENT ON COLUMN public.submissions.asana_attachments_sent IS 'DEPRECATED: Asana removed; replaced by slack_files_uploaded';
COMMENT ON COLUMN public.submissions.asana_attachments_uploaded IS 'DEPRECATED: Asana removed; replaced by slack_files_uploaded';
COMMENT ON COLUMN public.onboarding_requests.uses_asana IS 'DEPRECATED: Asana onboarding question removed';