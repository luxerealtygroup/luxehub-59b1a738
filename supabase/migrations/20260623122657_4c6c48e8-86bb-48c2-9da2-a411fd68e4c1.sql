
CREATE TABLE public.fub_deal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fub_deal_id integer NOT NULL,
  event_type text NOT NULL,
  deal_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fub_deal_events_fub_deal_id ON public.fub_deal_events(fub_deal_id);
CREATE INDEX idx_fub_deal_events_received_at ON public.fub_deal_events(received_at DESC);

GRANT SELECT ON public.fub_deal_events TO authenticated;
GRANT ALL ON public.fub_deal_events TO service_role;

ALTER TABLE public.fub_deal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/owners can read fub_deal_events"
  ON public.fub_deal_events FOR SELECT TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER trg_fub_deal_events_updated_at
  BEFORE UPDATE ON public.fub_deal_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.fub_person_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fub_person_id integer NOT NULL,
  event_type text NOT NULL,
  person_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fub_person_events_fub_person_id ON public.fub_person_events(fub_person_id);
CREATE INDEX idx_fub_person_events_received_at ON public.fub_person_events(received_at DESC);

GRANT SELECT ON public.fub_person_events TO authenticated;
GRANT ALL ON public.fub_person_events TO service_role;

ALTER TABLE public.fub_person_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/owners can read fub_person_events"
  ON public.fub_person_events FOR SELECT TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER trg_fub_person_events_updated_at
  BEFORE UPDATE ON public.fub_person_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
