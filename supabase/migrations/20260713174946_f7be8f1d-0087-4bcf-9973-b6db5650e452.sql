CREATE TABLE public.ac_nominations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nomination_type TEXT NOT NULL CHECK (nomination_type IN ('myself','someone_else')),
  nominator_name TEXT NOT NULL,
  nominator_email TEXT NOT NULL,
  nominator_phone TEXT NOT NULL,
  nominator_consent BOOLEAN NOT NULL DEFAULT false,
  nominee_name TEXT,
  nominee_address TEXT,
  nominee_phone TEXT,
  household_size INTEGER,
  nominee_consent BOOLEAN NOT NULL DEFAULT false,
  story TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.ac_nominations TO anon;
GRANT INSERT ON public.ac_nominations TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.ac_nominations TO authenticated;
GRANT ALL ON public.ac_nominations TO service_role;

ALTER TABLE public.ac_nominations ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a nomination (public form)
CREATE POLICY "Anyone can submit AC nominations"
  ON public.ac_nominations
  FOR INSERT
  WITH CHECK (
    nominator_consent = true
    AND char_length(nominator_name) BETWEEN 1 AND 200
    AND char_length(nominator_email) BETWEEN 3 AND 320
    AND char_length(nominator_phone) BETWEEN 1 AND 40
    AND char_length(story) BETWEEN 1 AND 5000
    AND (
      nomination_type = 'myself'
      OR (
        nomination_type = 'someone_else'
        AND nominee_consent = true
        AND nominee_name IS NOT NULL AND char_length(nominee_name) BETWEEN 1 AND 200
        AND nominee_address IS NOT NULL AND char_length(nominee_address) BETWEEN 1 AND 500
        AND nominee_phone IS NOT NULL AND char_length(nominee_phone) BETWEEN 1 AND 40
      )
    )
  );

-- Admins/owners can view all
CREATE POLICY "Admins and owners can view all AC nominations"
  ON public.ac_nominations
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins and owners can update AC nominations"
  ON public.ac_nominations
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins and owners can delete AC nominations"
  ON public.ac_nominations
  FOR DELETE
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_ac_nominations_updated_at
  BEFORE UPDATE ON public.ac_nominations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();