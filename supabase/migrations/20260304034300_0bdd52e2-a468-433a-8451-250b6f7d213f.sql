
-- 1. Source categories (admin-managed taxonomy)
CREATE TABLE public.deal_source_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deal_source_categories ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "Authenticated users can view source categories"
  ON public.deal_source_categories FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can manage
CREATE POLICY "Admins can manage source categories"
  ON public.deal_source_categories FOR ALL
  TO authenticated
  USING (is_admin_or_owner(auth.uid()))
  WITH CHECK (is_admin_or_owner(auth.uid()));

-- Seed default categories
INSERT INTO public.deal_source_categories (name, sort_order) VALUES
  ('Sphere / Past Clients', 1),
  ('Referrals', 2),
  ('Open House', 3),
  ('Online Leads', 4),
  ('Social / Content', 5),
  ('Farming', 6),
  ('Cold Outreach', 7),
  ('Agent-to-Agent Referral', 8),
  ('Walk-in / Sign Call', 9),
  ('Other', 10);

-- 2. Deal sources (attribution records)
CREATE TABLE public.deal_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  fub_deal_id integer,
  deal_address text,
  deal_type text NOT NULL DEFAULT 'unknown',
  close_date date,
  status text NOT NULL DEFAULT 'pending',
  source_category text NOT NULL,
  source_notes text,
  gci numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deal_sources ENABLE ROW LEVEL SECURITY;

-- Agents see own, admins see all
CREATE POLICY "Users can view own deal sources"
  ON public.deal_sources FOR SELECT
  TO authenticated
  USING (auth.uid() = agent_id OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can insert own deal sources"
  ON public.deal_sources FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = agent_id OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can update own deal sources"
  ON public.deal_sources FOR UPDATE
  TO authenticated
  USING (auth.uid() = agent_id OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can delete own deal sources"
  ON public.deal_sources FOR DELETE
  TO authenticated
  USING (auth.uid() = agent_id OR is_admin_or_owner(auth.uid()));

-- 3. Source targets (admin-set goal mix percentages)
CREATE TABLE public.deal_source_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL DEFAULT EXTRACT(year FROM now()),
  source_category text NOT NULL,
  target_percentage numeric NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, source_category)
);

ALTER TABLE public.deal_source_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage source targets"
  ON public.deal_source_targets FOR ALL
  TO authenticated
  USING (is_admin_or_owner(auth.uid()))
  WITH CHECK (is_admin_or_owner(auth.uid()));

CREATE POLICY "Authenticated users can view source targets"
  ON public.deal_source_targets FOR SELECT
  TO authenticated
  USING (true);
