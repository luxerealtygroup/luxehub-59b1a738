
CREATE TABLE public.practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL DEFAULT current_user_org_id(),
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  scenario text,
  mode text,
  exchanges integer,
  earn_30_seconds integer CHECK (earn_30_seconds BETWEEN 0 AND 5),
  motivation_discovery integer CHECK (motivation_discovery BETWEEN 0 AND 5),
  talk_less_ratio integer CHECK (talk_less_ratio BETWEEN 0 AND 5),
  objection_handling integer CHECK (objection_handling BETWEEN 0 AND 5),
  the_ask integer CHECK (the_ask BETWEEN 0 AND 5),
  next_step_locked integer CHECK (next_step_locked BETWEEN 0 AND 5),
  total integer CHECK (total BETWEEN 0 AND 30),
  grade text,
  appointment_set boolean,
  strongest_moment text,
  costliest_moment text,
  one_thing_to_change text,
  drill_again text,
  coach_note text,
  raw_report text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX practice_sessions_user_date_idx ON public.practice_sessions (user_id, session_date DESC);

GRANT SELECT, INSERT ON public.practice_sessions TO authenticated;
GRANT ALL ON public.practice_sessions TO service_role;

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert their own practice sessions"
ON public.practice_sessions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND org_id = current_user_org_id());

CREATE POLICY "Users view own practice sessions, admins view all"
ON public.practice_sessions FOR SELECT TO authenticated
USING ((auth.uid() = user_id OR is_admin_or_owner(auth.uid())) AND org_id = current_user_org_id());
