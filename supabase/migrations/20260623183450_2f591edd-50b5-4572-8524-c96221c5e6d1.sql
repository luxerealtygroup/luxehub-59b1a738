
CREATE TABLE public.open_houses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  address text NOT NULL,
  city text,
  event_date date NOT NULL,
  start_time time,
  end_time time,
  mls_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_houses TO authenticated;
GRANT ALL ON public.open_houses TO service_role;

ALTER TABLE public.open_houses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents manage own open houses"
  ON public.open_houses FOR ALL
  TO authenticated
  USING (agent_id = auth.uid() OR public.is_admin_or_owner(auth.uid()))
  WITH CHECK (agent_id = auth.uid() OR public.is_admin_or_owner(auth.uid()));

CREATE INDEX open_houses_agent_id_idx ON public.open_houses(agent_id);
CREATE INDEX open_houses_event_date_idx ON public.open_houses(event_date);

CREATE TRIGGER open_houses_set_updated_at
  BEFORE UPDATE ON public.open_houses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.open_house_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_house_id uuid NOT NULL REFERENCES public.open_houses(id) ON DELETE CASCADE,
  initials text,
  full_name text,
  fub_contact_id bigint,
  fub_linked boolean NOT NULL DEFAULT false,
  source text,
  interest_level text,
  price_feedback text,
  condition_feedback text,
  pre_approved text,
  working_with_realtor text,
  home_to_sell text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_house_attendees TO authenticated;
GRANT ALL ON public.open_house_attendees TO service_role;

ALTER TABLE public.open_house_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents manage attendees on own open houses"
  ON public.open_house_attendees FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.open_houses oh
      WHERE oh.id = open_house_id
        AND (oh.agent_id = auth.uid() OR public.is_admin_or_owner(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.open_houses oh
      WHERE oh.id = open_house_id
        AND (oh.agent_id = auth.uid() OR public.is_admin_or_owner(auth.uid()))
    )
  );

CREATE INDEX open_house_attendees_open_house_id_idx ON public.open_house_attendees(open_house_id);

CREATE TRIGGER open_house_attendees_set_updated_at
  BEFORE UPDATE ON public.open_house_attendees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
