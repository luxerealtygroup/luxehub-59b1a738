CREATE POLICY "Admins and owners view all client accounts"
ON public.client_accounts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));