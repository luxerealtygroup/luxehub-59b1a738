DROP TRIGGER IF EXISTS capture_launchpad_slide_version ON public.launchpad_slides;
DROP FUNCTION IF EXISTS public.capture_launchpad_slide_version();
DROP TABLE IF EXISTS public.launchpad_slide_versions CASCADE;