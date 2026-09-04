DROP POLICY IF EXISTS "Super admin views all tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Super admin views all ticket messages" ON public.support_messages;

CREATE POLICY "Platform operator views all tickets"
ON public.support_tickets FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'owner')
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.organizations o ON o.id = p.org_id
    WHERE p.id = auth.uid() AND o.is_original_org
  )
);

CREATE POLICY "Platform operator views all ticket messages"
ON public.support_messages FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'owner')
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.organizations o ON o.id = p.org_id
    WHERE p.id = auth.uid() AND o.is_original_org
  )
);