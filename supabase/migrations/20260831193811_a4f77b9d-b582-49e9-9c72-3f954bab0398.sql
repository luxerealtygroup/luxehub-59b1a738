CREATE POLICY "Clients can claim their pending portal by email" ON public.client_accounts FOR UPDATE TO authenticated USING ( user_id IS NULL AND lower(email) = lower(auth.jwt() ->> 'email') ) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Clients can create their own account" ON public.client_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);