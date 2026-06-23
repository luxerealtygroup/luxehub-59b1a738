
-- Drop previous version to rebuild with new schema
DROP TABLE IF EXISTS public.open_house_attendees CASCADE;
DROP TABLE IF EXISTS public.open_houses CASCADE;

CREATE TABLE public.open_houses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_address text NOT NULL,
  open_house_date date NOT NULL,
  listing_agent_name text,
  listing_agent_email text,
  client_name text,
  client_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_houses TO authenticated;
GRANT ALL ON public.open_houses TO service_role;

ALTER TABLE public.open_houses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own open houses"
  ON public.open_houses FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX open_houses_user_id_idx ON public.open_houses(user_id);
CREATE INDEX open_houses_date_idx ON public.open_houses(open_house_date);

CREATE TRIGGER open_houses_set_updated_at
  BEFORE UPDATE ON public.open_houses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.open_house_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_house_id uuid NOT NULL REFERENCES public.open_houses(id) ON DELETE CASCADE,
  initials text NOT NULL,
  full_name text,
  fub_contact_id text,
  fub_linked boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('curb_hero', 'manual')),
  interest_level text CHECK (interest_level IN ('high', 'medium', 'low')),
  price_feedback text CHECK (price_feedback IN ('priced_right', 'slightly_high', 'too_high', 'below_market')),
  condition_feedback text CHECK (condition_feedback IN ('excellent', 'good', 'fair', 'needs_work')),
  pre_approved boolean NOT NULL DEFAULT false,
  working_with_realtor boolean NOT NULL DEFAULT false,
  home_to_sell boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_house_attendees TO authenticated;
GRANT ALL ON public.open_house_attendees TO service_role;

ALTER TABLE public.open_house_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage attendees on own open houses"
  ON public.open_house_attendees FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.open_houses oh
      WHERE oh.id = open_house_id AND oh.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.open_houses oh
      WHERE oh.id = open_house_id AND oh.user_id = auth.uid()
    )
  );

CREATE INDEX open_house_attendees_open_house_id_idx ON public.open_house_attendees(open_house_id);

CREATE TRIGGER open_house_attendees_set_updated_at
  BEFORE UPDATE ON public.open_house_attendees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
