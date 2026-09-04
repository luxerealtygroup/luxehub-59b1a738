CREATE POLICY "Super admin views all tickets"
ON public.support_tickets FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin views all ticket messages"
ON public.support_messages FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));