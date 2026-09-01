CREATE TABLE public.onboarding_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name text NOT NULL,
  business_name text NOT NULL,
  legal_name text,
  email text NOT NULL,
  phone text,
  website text,
  desired_domain text,
  logo_path text,
  team_size text,
  service_area text,
  slack_admin_name text,
  slack_admin_email text,
  uses_fub boolean,
  uses_stripe boolean,
  uses_asana boolean,
  extra_notes text,
  status text NOT NULL DEFAULT 'new',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_requests_status_check CHECK (status IN ('new','in_progress','live','declined')),
  CONSTRAINT onboarding_requests_email_check CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 255),
  CONSTRAINT onboarding_requests_len_check CHECK (
    length(contact_name) BETWEEN 1 AND 120
    AND length(business_name) BETWEEN 1 AND 160
    AND coalesce(length(legal_name),0) <= 200
    AND coalesce(length(phone),0) <= 40
    AND coalesce(length(website),0) <= 255
    AND coalesce(length(desired_domain),0) <= 255
    AND coalesce(length(logo_path),0) <= 500
    AND coalesce(length(team_size),0) <= 60
    AND coalesce(length(service_area),0) <= 200
    AND coalesce(length(slack_admin_name),0) <= 120
    AND coalesce(length(slack_admin_email),0) <= 255
    AND coalesce(length(extra_notes),0) <= 2000
  )
);

CREATE INDEX idx_onboarding_requests_created_at ON public.onboarding_requests (created_at DESC);
CREATE INDEX idx_onboarding_requests_email_created ON public.onboarding_requests (lower(email), created_at DESC);

GRANT INSERT ON public.onboarding_requests TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.onboarding_requests TO authenticated;
GRANT ALL ON public.onboarding_requests TO service_role;

ALTER TABLE public.onboarding_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit an onboarding request"
  ON public.onboarding_requests FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read onboarding requests"
  ON public.onboarding_requests FOR SELECT TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can update onboarding requests"
  ON public.onboarding_requests FOR UPDATE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can delete onboarding requests"
  ON public.onboarding_requests FOR DELETE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_onboarding_request_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  NEW.status := 'new';
  NEW.admin_notes := NULL;

  IF (SELECT count(*) FROM public.onboarding_requests
      WHERE lower(email) = NEW.email
        AND created_at > now() - interval '24 hours') >= 3 THEN
    RAISE EXCEPTION 'Too many requests from this email. Please email us instead.';
  END IF;

  IF (SELECT count(*) FROM public.onboarding_requests
      WHERE created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Too many requests right now. Please try again shortly.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_onboarding_request_rate
  BEFORE INSERT ON public.onboarding_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_onboarding_request_rate();

CREATE TRIGGER update_onboarding_requests_updated_at
  BEFORE UPDATE ON public.onboarding_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();