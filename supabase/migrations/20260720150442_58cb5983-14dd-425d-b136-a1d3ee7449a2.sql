
-- Support tickets
CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('realtor','client')),
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'ai_active' CHECK (status IN ('ai_active','escalated','in_progress','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  context_route TEXT,
  context_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  escalation_reason TEXT,
  escalated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tickets" ON public.support_tickets FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Users insert own tickets" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own tickets" ON public.support_tickets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins delete tickets" ON public.support_tickets FOR DELETE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_assigned ON public.support_tickets(assigned_admin_id);

-- Support messages
CREATE TABLE public.support_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user','ai','admin','system')),
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View messages for accessible tickets" ON public.support_messages FOR SELECT TO authenticated
  USING (
    public.is_admin_or_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Insert messages on own tickets or as admin" ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE INDEX idx_support_messages_ticket ON public.support_messages(ticket_id, created_at);

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
