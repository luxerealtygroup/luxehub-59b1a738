ALTER TABLE public.weekly_411
  ADD COLUMN IF NOT EXISTS fub_appointments_set integer,
  ADD COLUMN IF NOT EXISTS fub_appointments_held integer;