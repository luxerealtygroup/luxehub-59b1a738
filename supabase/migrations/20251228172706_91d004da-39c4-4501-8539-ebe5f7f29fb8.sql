-- Add category to agent_goals for personal vs business goals
ALTER TABLE public.agent_goals 
ADD COLUMN category text NOT NULL DEFAULT 'business';

-- Add personal priorities to weekly_411
ALTER TABLE public.weekly_411
ADD COLUMN personal_priority_1 text,
ADD COLUMN personal_priority_1_completed boolean DEFAULT false,
ADD COLUMN personal_priority_2 text,
ADD COLUMN personal_priority_2_completed boolean DEFAULT false,
ADD COLUMN personal_priority_3 text,
ADD COLUMN personal_priority_3_completed boolean DEFAULT false;