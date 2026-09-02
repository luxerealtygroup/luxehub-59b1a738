DROP POLICY IF EXISTS "Admins can update onboarding requests" ON public.onboarding_requests;
DROP POLICY IF EXISTS "Admins can delete onboarding requests" ON public.onboarding_requests;

CREATE POLICY "Super admins update onboarding requests"
ON public.onboarding_requests
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins delete onboarding requests"
ON public.onboarding_requests
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));