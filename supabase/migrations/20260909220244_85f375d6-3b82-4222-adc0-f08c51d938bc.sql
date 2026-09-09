ALTER TABLE public.open_house_visitors
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'visitor',
  ADD COLUMN IF NOT EXISTS logged_by uuid,
  ADD COLUMN IF NOT EXISTS temperature text,
  ADD COLUMN IF NOT EXISTS interest_level text,
  ADD COLUMN IF NOT EXISTS price_feedback text,
  ADD COLUMN IF NOT EXISTS condition_feedback text,
  ADD COLUMN IF NOT EXISTS fub_contact_id text,
  ADD COLUMN IF NOT EXISTS fub_linked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_channel text,
  ADD COLUMN IF NOT EXISTS legacy_attendee_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.open_house_visitors DROP CONSTRAINT IF EXISTS open_house_visitors_source_check;
ALTER TABLE public.open_house_visitors ADD CONSTRAINT open_house_visitors_source_check
  CHECK (source IN ('visitor','agent'));

ALTER TABLE public.open_house_visitors DROP CONSTRAINT IF EXISTS open_house_visitors_temperature_check;
ALTER TABLE public.open_house_visitors ADD CONSTRAINT open_house_visitors_temperature_check
  CHECK (temperature IS NULL OR temperature IN ('hot','warm','cold'));

ALTER TABLE public.open_house_visitors DROP CONSTRAINT IF EXISTS open_house_visitors_interest_check;
ALTER TABLE public.open_house_visitors ADD CONSTRAINT open_house_visitors_interest_check
  CHECK (interest_level IS NULL OR interest_level IN ('high','medium','low'));

ALTER TABLE public.open_house_visitors DROP CONSTRAINT IF EXISTS open_house_visitors_price_check;
ALTER TABLE public.open_house_visitors ADD CONSTRAINT open_house_visitors_price_check
  CHECK (price_feedback IS NULL OR price_feedback IN ('priced_right','slightly_high','too_high','below_market'));

ALTER TABLE public.open_house_visitors DROP CONSTRAINT IF EXISTS open_house_visitors_condition_check;
ALTER TABLE public.open_house_visitors ADD CONSTRAINT open_house_visitors_condition_check
  CHECK (condition_feedback IS NULL OR condition_feedback IN ('excellent','good','fair','needs_work'));

ALTER TABLE public.open_house_visitors DROP CONSTRAINT IF EXISTS open_house_visitors_followup_channel_check;
ALTER TABLE public.open_house_visitors ADD CONSTRAINT open_house_visitors_followup_channel_check
  CHECK (follow_up_channel IS NULL OR follow_up_channel IN ('sms','email'));

-- A visitor typing their own details must leave a way to reach them; a row an
-- agent logs from conversation may legitimately have neither yet.
ALTER TABLE public.open_house_visitors DROP CONSTRAINT IF EXISTS open_house_visitors_contact_required;
ALTER TABLE public.open_house_visitors ADD CONSTRAINT open_house_visitors_contact_required
  CHECK (
    source = 'agent'
    OR COALESCE(btrim(email), '') <> ''
    OR COALESCE(btrim(phone), '') <> ''
  );

CREATE UNIQUE INDEX IF NOT EXISTS open_house_visitors_legacy_attendee_idx
  ON public.open_house_visitors (legacy_attendee_id) WHERE legacy_attendee_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_open_house_visitors_updated_at ON public.open_house_visitors;
CREATE TRIGGER update_open_house_visitors_updated_at
  BEFORE UPDATE ON public.open_house_visitors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- One list, one count: copy every hand-logged attendee into the guest list.
INSERT INTO public.open_house_visitors (
  open_house_id, org_id, first_name, last_name, source, legacy_attendee_id,
  working_with_agent, has_home_to_sell, lender_status, interest_level,
  price_feedback, condition_feedback, fub_contact_id, fub_linked,
  notes, custom_answers, disclosure_accepted, signed_in_at, created_at
)
SELECT
  a.open_house_id,
  a.org_id,
  COALESCE(NULLIF(btrim(split_part(COALESCE(a.full_name, ''), ' ', 1)), ''), a.initials),
  NULLIF(btrim(substr(COALESCE(a.full_name, ''), strpos(COALESCE(a.full_name, '') || ' ', ' ') + 1)), ''),
  'agent',
  a.id,
  a.working_with_realtor,
  CASE WHEN a.home_to_sell THEN 'yes' ELSE NULL END,
  CASE WHEN a.pre_approved THEN 'pre_approved' ELSE NULL END,
  a.interest_level,
  a.price_feedback,
  a.condition_feedback,
  a.fub_contact_id,
  a.fub_linked,
  a.notes,
  '{}'::jsonb,
  false,
  a.created_at,
  a.created_at
FROM public.open_house_attendees a
WHERE NOT EXISTS (
  SELECT 1 FROM public.open_house_visitors v WHERE v.legacy_attendee_id = a.id
);

-- Agents manage guests on the open houses they own or host; admins across the org.
DROP POLICY IF EXISTS "Agents manage guests on their open houses" ON public.open_house_visitors;
CREATE POLICY "Agents manage guests on their open houses"
ON public.open_house_visitors
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.open_houses oh
    WHERE oh.id = open_house_visitors.open_house_id
      AND oh.org_id = public.current_user_org_id()
      AND (
        oh.user_id = auth.uid()
        OR oh.hosting_agent_id = auth.uid()
        OR oh.listing_agent_id = auth.uid()
        OR public.is_admin_or_owner(auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.open_houses oh
    WHERE oh.id = open_house_visitors.open_house_id
      AND oh.org_id = public.current_user_org_id()
      AND (
        oh.user_id = auth.uid()
        OR oh.hosting_agent_id = auth.uid()
        OR oh.listing_agent_id = auth.uid()
        OR public.is_admin_or_owner(auth.uid())
      )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_house_visitors TO authenticated;
GRANT ALL ON public.open_house_visitors TO service_role;

-- Prep checklist, per open house.
ALTER TABLE public.open_houses
  ADD COLUMN IF NOT EXISTS prep_kiosk_loaded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prep_signs_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prep_qr_printed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prep_tablet_charged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prep_doors_knocked integer;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.open_house_visitors;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.open_house_visitors REPLICA IDENTITY FULL;