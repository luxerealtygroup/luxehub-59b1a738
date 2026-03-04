
-- Create deal_metadata table for internal lease/sale classification
CREATE TABLE public.deal_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fub_deal_id integer NOT NULL UNIQUE,
  deal_category text NOT NULL DEFAULT 'sale' CHECK (deal_category IN ('sale', 'lease')),
  weight_override numeric NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deal_metadata ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view deal metadata
CREATE POLICY "Authenticated users can view deal_metadata"
  ON public.deal_metadata FOR SELECT
  TO authenticated
  USING (true);

-- Admins and owners can manage deal metadata
CREATE POLICY "Admins can insert deal_metadata"
  ON public.deal_metadata FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can update deal_metadata"
  ON public.deal_metadata FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can delete deal_metadata"
  ON public.deal_metadata FOR DELETE
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));
