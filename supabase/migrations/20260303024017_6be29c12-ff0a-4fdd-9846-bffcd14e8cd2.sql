
-- Add new numeric tracking fields to weekly_411
ALTER TABLE public.weekly_411
  ADD COLUMN IF NOT EXISTS contacts_made integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dials integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS doors_knocked integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS appointments_set integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS appointments_held integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pipeline_additions integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contracts_signed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS firm_deals integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS database_size integer DEFAULT 0;

-- Create appointment_records table for structured appointment tracking
CREATE TABLE public.appointment_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  weekly_411_id uuid REFERENCES public.weekly_411(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  fub_contact_id integer,
  contact_name text NOT NULL,
  appointment_date date NOT NULL,
  appointment_type text NOT NULL DEFAULT 'buyer',
  outcome text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.appointment_records ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own appointment records"
  ON public.appointment_records FOR SELECT
  USING (auth.uid() = user_id OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can insert their own appointment records"
  ON public.appointment_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own appointment records"
  ON public.appointment_records FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own appointment records"
  ON public.appointment_records FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_appointment_records_updated_at
  BEFORE UPDATE ON public.appointment_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
