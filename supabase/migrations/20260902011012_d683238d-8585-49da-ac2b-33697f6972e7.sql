
-- helper: is a given user in my org?
CREATE OR REPLACE FUNCTION public.user_in_my_org(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND p.org_id = public.current_user_org_id()
  )
$$;

DO $$
DECLARE v_org uuid; t text;
BEGIN
  SELECT id INTO v_org FROM public.organizations WHERE is_original_org LIMIT 1;

  FOREACH t IN ARRAY ARRAY['recruiting_pipeline','asana_settings','deal_source_categories',
                           'deal_source_targets','fub_deal_events','fub_person_events',
                           'fub_webhook_events','launchpad_modules','launchpad_slides',
                           'launchpad_progress','launchpad_module_progress'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE public.%I SET org_id = %L WHERE org_id IS NULL', t, v_org);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (org_id)', 'idx_'||t||'_org_id', t);
    EXECUTE format('DROP TRIGGER IF EXISTS set_org_id_on_insert ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_org_id_on_insert BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_context()', t);
  END LOOP;
END $$;

-- recruiting_pipeline
DROP POLICY IF EXISTS "Admins can manage recruiting pipeline" ON public.recruiting_pipeline;
CREATE POLICY "Admins manage recruiting pipeline in their org" ON public.recruiting_pipeline
  FOR ALL TO authenticated
  USING (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id())
  WITH CHECK (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id());

-- asana_settings
DROP POLICY IF EXISTS "Admins can manage Asana settings" ON public.asana_settings;
DROP POLICY IF EXISTS "Authenticated users can view Asana settings" ON public.asana_settings;
CREATE POLICY "Admins manage Asana settings in their org" ON public.asana_settings
  FOR ALL TO authenticated
  USING (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id())
  WITH CHECK (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id());
CREATE POLICY "Team members view Asana settings in their org" ON public.asana_settings
  FOR SELECT TO authenticated
  USING (org_id = current_user_org_id());

-- deal source taxonomy
DROP POLICY IF EXISTS "Admins can manage source categories" ON public.deal_source_categories;
DROP POLICY IF EXISTS "Authenticated users can view source categories" ON public.deal_source_categories;
CREATE POLICY "Admins manage source categories in their org" ON public.deal_source_categories
  FOR ALL TO authenticated
  USING (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id())
  WITH CHECK (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id());
CREATE POLICY "Team members view source categories in their org" ON public.deal_source_categories
  FOR SELECT TO authenticated
  USING (org_id = current_user_org_id() OR org_id IS NULL);

DROP POLICY IF EXISTS "Admins can manage source targets" ON public.deal_source_targets;
DROP POLICY IF EXISTS "Authenticated users can view source targets" ON public.deal_source_targets;
CREATE POLICY "Admins manage source targets in their org" ON public.deal_source_targets
  FOR ALL TO authenticated
  USING (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id())
  WITH CHECK (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id());
CREATE POLICY "Team members view source targets in their org" ON public.deal_source_targets
  FOR SELECT TO authenticated
  USING (org_id = current_user_org_id() OR org_id IS NULL);

-- FUB event logs
DROP POLICY IF EXISTS "Admins/owners can read fub_deal_events" ON public.fub_deal_events;
CREATE POLICY "Admins read fub_deal_events in their org" ON public.fub_deal_events
  FOR SELECT TO authenticated
  USING (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id());

DROP POLICY IF EXISTS "Admins/owners can read fub_person_events" ON public.fub_person_events;
CREATE POLICY "Admins read fub_person_events in their org" ON public.fub_person_events
  FOR SELECT TO authenticated
  USING (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id());

DROP POLICY IF EXISTS "Admins can view fub webhook events" ON public.fub_webhook_events;
CREATE POLICY "Admins read fub webhook events in their org" ON public.fub_webhook_events
  FOR SELECT TO authenticated
  USING (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id());

-- Launchpad curriculum
DROP POLICY IF EXISTS "Team members can view modules" ON public.launchpad_modules;
DROP POLICY IF EXISTS "Admins manage modules" ON public.launchpad_modules;
CREATE POLICY "Team members view modules in their org" ON public.launchpad_modules
  FOR SELECT TO authenticated
  USING (is_team_member(auth.uid()) AND (org_id = current_user_org_id() OR org_id IS NULL));
CREATE POLICY "Admins manage modules in their org" ON public.launchpad_modules
  FOR ALL TO authenticated
  USING (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id())
  WITH CHECK (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id());

DROP POLICY IF EXISTS "Team members can view slides" ON public.launchpad_slides;
DROP POLICY IF EXISTS "Admins manage slides" ON public.launchpad_slides;
CREATE POLICY "Team members view slides in their org" ON public.launchpad_slides
  FOR SELECT TO authenticated
  USING (is_team_member(auth.uid()) AND (org_id = current_user_org_id() OR org_id IS NULL));
CREATE POLICY "Admins manage slides in their org" ON public.launchpad_slides
  FOR ALL TO authenticated
  USING (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id())
  WITH CHECK (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id());

-- Launchpad progress
DROP POLICY IF EXISTS "Own progress select" ON public.launchpad_progress;
CREATE POLICY "Own progress select" ON public.launchpad_progress
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (org_id = current_user_org_id() AND (is_mentor_of(user_id) OR is_admin_or_owner(auth.uid())))
  );

DROP POLICY IF EXISTS "Own module progress select" ON public.launchpad_module_progress;
CREATE POLICY "Own module progress select" ON public.launchpad_module_progress
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (org_id = current_user_org_id() AND (is_mentor_of(user_id) OR is_admin_or_owner(auth.uid())))
  );

-- user_roles: admins only see roles of users in their own org
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users view own roles; admins view their org" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR (is_admin_or_owner(auth.uid()) AND public.user_in_my_org(user_id)));

DROP POLICY IF EXISTS "Only owners can insert roles" ON public.user_roles;
CREATE POLICY "Owners insert roles in their org" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner') AND public.user_in_my_org(user_id));
DROP POLICY IF EXISTS "Only owners can update roles" ON public.user_roles;
CREATE POLICY "Owners update roles in their org" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner') AND public.user_in_my_org(user_id));
DROP POLICY IF EXISTS "Only owners can delete roles" ON public.user_roles;
CREATE POLICY "Owners delete roles in their org" ON public.user_roles
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner') AND public.user_in_my_org(user_id));

-- instance-wide surfaces: super admins only
DROP POLICY IF EXISTS "Admins can read onboarding requests" ON public.onboarding_requests;
CREATE POLICY "Super admins read onboarding requests" ON public.onboarding_requests
  FOR SELECT TO authenticated USING (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can view integration status" ON public.instance_integrations;
CREATE POLICY "Super admins view instance integration status" ON public.instance_integrations
  FOR SELECT TO authenticated USING (is_super_admin(auth.uid()));
