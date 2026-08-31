ALTER TABLE public.portal_transactions
  ADD COLUMN IF NOT EXISTS deposit_due_date date,
  ADD COLUMN IF NOT EXISTS requisition_date date;

CREATE TABLE public.portal_transaction_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.portal_transactions(id) ON DELETE CASCADE,
  condition_type text NOT NULL DEFAULT 'financing',
  custom_label text,
  due_date date,
  status text NOT NULL DEFAULT 'outstanding',
  resolved_date date,
  responsible_party text NOT NULL DEFAULT 'client',
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_transaction_conditions_status_check
    CHECK (status IN ('outstanding','waived','fulfilled','not_met')),
  CONSTRAINT portal_transaction_conditions_party_check
    CHECK (responsible_party IN ('client','agent','lawyer','lender'))
);

CREATE INDEX idx_ptc_transaction ON public.portal_transaction_conditions(transaction_id);
CREATE INDEX idx_ptc_portal ON public.portal_transaction_conditions(portal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_transaction_conditions TO authenticated;
GRANT ALL ON public.portal_transaction_conditions TO service_role;

ALTER TABLE public.portal_transaction_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conditions select" ON public.portal_transaction_conditions
  FOR SELECT TO authenticated
  USING (is_team_member(auth.uid()) OR is_admin_or_owner(auth.uid()) OR owns_portal(portal_id, auth.uid()));

CREATE POLICY "conditions insert" ON public.portal_transaction_conditions
  FOR INSERT TO authenticated
  WITH CHECK (is_team_member(auth.uid()) OR is_admin_or_owner(auth.uid()));

CREATE POLICY "conditions update" ON public.portal_transaction_conditions
  FOR UPDATE TO authenticated
  USING (is_team_member(auth.uid()) OR is_admin_or_owner(auth.uid()))
  WITH CHECK (is_team_member(auth.uid()) OR is_admin_or_owner(auth.uid()));

CREATE POLICY "conditions delete" ON public.portal_transaction_conditions
  FOR DELETE TO authenticated
  USING (is_team_member(auth.uid()) OR is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_portal_transaction_conditions_updated_at
  BEFORE UPDATE ON public.portal_transaction_conditions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.portal_condition_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id uuid NOT NULL UNIQUE REFERENCES public.portal_transaction_conditions(id) ON DELETE CASCADE,
  portal_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  is_internal boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pcn_condition ON public.portal_condition_notes(condition_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_condition_notes TO authenticated;
GRANT ALL ON public.portal_condition_notes TO service_role;

ALTER TABLE public.portal_condition_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "condition notes select" ON public.portal_condition_notes
  FOR SELECT TO authenticated
  USING (
    is_team_member(auth.uid())
    OR is_admin_or_owner(auth.uid())
    OR (owns_portal(portal_id, auth.uid()) AND is_internal = false)
  );

CREATE POLICY "condition notes insert" ON public.portal_condition_notes
  FOR INSERT TO authenticated
  WITH CHECK (is_team_member(auth.uid()) OR is_admin_or_owner(auth.uid()));

CREATE POLICY "condition notes update" ON public.portal_condition_notes
  FOR UPDATE TO authenticated
  USING (is_team_member(auth.uid()) OR is_admin_or_owner(auth.uid()))
  WITH CHECK (is_team_member(auth.uid()) OR is_admin_or_owner(auth.uid()));

CREATE POLICY "condition notes delete" ON public.portal_condition_notes
  FOR DELETE TO authenticated
  USING (is_team_member(auth.uid()) OR is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_portal_condition_notes_updated_at
  BEFORE UPDATE ON public.portal_condition_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();