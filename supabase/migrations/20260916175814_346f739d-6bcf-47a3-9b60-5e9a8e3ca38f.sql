ALTER TABLE public.onboarding_requests
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz;

UPDATE public.onboarding_requests
SET org_id = 'c22c74db-a887-481f-8457-bd660fb9e7c6'
WHERE id = '89d8371d-46e0-4c77-8f5b-f89d816981d5';