-- Create table to store shared Asana integration settings
CREATE TABLE public.asana_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  projects JSONB NOT NULL DEFAULT '{"open_house": "", "invoice": "", "listing": "", "buyer": ""}',
  field_mappings JSONB NOT NULL DEFAULT '{"open_house": {}, "invoice": {}, "listing": {}, "buyer": {}}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.asana_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read the settings (authenticated users)
CREATE POLICY "Authenticated users can view Asana settings"
ON public.asana_settings
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admins/owners can modify settings
CREATE POLICY "Admins can manage Asana settings"
ON public.asana_settings
FOR ALL
USING (public.is_admin_or_owner(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_asana_settings_updated_at
BEFORE UPDATE ON public.asana_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default row so there's always one settings record
INSERT INTO public.asana_settings (enabled, projects, field_mappings)
VALUES (false, '{"open_house": "", "invoice": "", "listing": "", "buyer": ""}', '{"open_house": {}, "invoice": {}, "listing": {}, "buyer": {}}');