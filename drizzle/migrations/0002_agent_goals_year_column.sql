-- Add calendar-year scoping to agent goals so each year can hold its own yearly goals.
ALTER TABLE public.agent_goals ADD COLUMN year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int;

-- Backfill: every existing row is a 2026 goal.
UPDATE public.agent_goals SET year = 2026;

COMMENT ON COLUMN public.agent_goals.year IS 'Calendar year the goal applies to.';
