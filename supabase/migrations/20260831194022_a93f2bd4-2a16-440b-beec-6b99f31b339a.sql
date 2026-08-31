CREATE POLICY "Agents update their invited clients; admins/owners update any"
ON public.client_accounts
FOR UPDATE
TO authenticated
USING (
  auth.uid() = invited_by
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'owner'::app_role)
)
WITH CHECK (
  auth.uid() = invited_by
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'owner'::app_role)
);

CREATE POLICY "Admins insert client accounts"
ON public.client_accounts
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));