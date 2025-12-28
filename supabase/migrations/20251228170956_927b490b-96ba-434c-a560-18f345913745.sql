-- Create 4-1-1 weekly tracker table
CREATE TABLE public.weekly_411 (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  week_start_date date NOT NULL,
  
  -- Weekly activity goals (the 4 weekly priorities)
  calls_goal integer DEFAULT 0,
  calls_actual integer DEFAULT 0,
  appointments_goal integer DEFAULT 0,
  appointments_actual integer DEFAULT 0,
  listings_goal integer DEFAULT 0,
  listings_actual integer DEFAULT 0,
  contracts_goal integer DEFAULT 0,
  contracts_actual integer DEFAULT 0,
  
  -- Custom weekly priorities
  priority_1 text,
  priority_1_completed boolean DEFAULT false,
  priority_2 text,
  priority_2_completed boolean DEFAULT false,
  priority_3 text,
  priority_3_completed boolean DEFAULT false,
  priority_4 text,
  priority_4_completed boolean DEFAULT false,
  
  -- Accountability notes
  wins text,
  challenges text,
  next_steps text,
  notes text,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, week_start_date)
);

-- Create annual/monthly goals table
CREATE TABLE public.production_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  year integer NOT NULL,
  
  -- Annual goals (the 1 annual)
  annual_units_goal integer DEFAULT 0,
  annual_gci_goal numeric DEFAULT 0,
  annual_volume_goal numeric DEFAULT 0,
  annual_focus text,
  
  -- Monthly goals (the 1 monthly) - stored as JSON array
  monthly_goals jsonb DEFAULT '[]'::jsonb,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, year)
);

-- Enable RLS
ALTER TABLE public.weekly_411 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_goals ENABLE ROW LEVEL SECURITY;

-- RLS policies for weekly_411
CREATE POLICY "Users can view their own 411" ON public.weekly_411
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own 411" ON public.weekly_411
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own 411" ON public.weekly_411
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own 411" ON public.weekly_411
FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for production_goals
CREATE POLICY "Users can view their own production goals" ON public.production_goals
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own production goals" ON public.production_goals
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own production goals" ON public.production_goals
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own production goals" ON public.production_goals
FOR DELETE USING (auth.uid() = user_id);

-- Add triggers for updated_at
CREATE TRIGGER update_weekly_411_updated_at
BEFORE UPDATE ON public.weekly_411
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_production_goals_updated_at
BEFORE UPDATE ON public.production_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();