DROP POLICY IF EXISTS "Users can update their own pipeline clients" ON public.pipeline_clients;

CREATE POLICY "Users and admins can update pipeline clients"
ON public.pipeline_clients
FOR UPDATE
TO authenticated
USING ((auth.uid() = user_id) OR public.is_admin_or_owner(auth.uid()))
WITH CHECK ((auth.uid() = user_id) OR public.is_admin_or_owner(auth.uid()));