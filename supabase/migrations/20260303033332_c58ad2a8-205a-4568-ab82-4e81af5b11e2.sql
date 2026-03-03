-- Add 'planning_access' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'planning_access';

-- Add access_expires_at column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_expires_at timestamp with time zone DEFAULT NULL;
