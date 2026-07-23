-- Dedupe coaching_sessions: keep newest per (agent_id, week_of)
DELETE FROM public.coaching_sessions a
USING public.coaching_sessions b
WHERE a.agent_id = b.agent_id
  AND a.week_of = b.week_of
  AND a.created_at < b.created_at;

-- Enforce uniqueness so upsert onConflict works
ALTER TABLE public.coaching_sessions
  ADD CONSTRAINT coaching_sessions_agent_week_unique UNIQUE (agent_id, week_of);