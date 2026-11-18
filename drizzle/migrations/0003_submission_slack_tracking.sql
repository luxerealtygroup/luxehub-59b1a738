ALTER TABLE public.submissions ADD COLUMN slack_ts text, ADD COLUMN slack_channel_id text, ADD COLUMN slack_posted_at timestamptz, ADD COLUMN slack_files_uploaded integer, ADD COLUMN slack_error text;
CREATE TABLE public.submission_slack_channels (
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 form_type text NOT NULL CHECK (form_type IN ('open_house','listing','buyer','invoice')),
 channel_id text,
 channel_name text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (org_id, form_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_slack_channels TO authenticated;
GRANT ALL ON public.submission_slack_channels TO service_role;
ALTER TABLE public.submission_slack_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Office manages submission Slack destinations in own org" ON public.submission_slack_channels FOR ALL TO authenticated USING (org_id = public.current_user_org_id() AND (public.is_admin_or_owner(auth.uid()) OR public.is_operations(auth.uid()))) WITH CHECK (org_id = public.current_user_org_id() AND (public.is_admin_or_owner(auth.uid()) OR public.is_operations(auth.uid())));
CREATE POLICY "Service manages submission Slack destinations" ON public.submission_slack_channels FOR ALL TO service_role USING (true) WITH CHECK (true);