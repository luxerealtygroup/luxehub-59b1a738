
-- ============ helpers ============
create or replace function public.storage_path_uuid(_name text, _pos int)
returns uuid language sql immutable set search_path to 'public' as $$
  select case
    when split_part(coalesce(_name,''), '/', _pos) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then split_part(_name, '/', _pos)::uuid
    else null end
$$;

create or replace function public.storage_owner_in_my_org(_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = public.storage_path_uuid(_name, 1)
      and p.org_id is not null
      and p.org_id = public.current_user_org_id()
  )
$$;

create or replace function public.storage_client_doc_in_my_org(_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.storage_owner_in_my_org(_name)
    or (
      split_part(coalesce(_name,''), '/', 1) = 'submissions'
      and exists (
        select 1 from public.profiles p
        where p.org_id is not null
          and p.org_id = public.current_user_org_id()
          and p.id::text = any(string_to_array(_name, '/'))
      )
    )
    or exists (
      select 1 from public.client_documents d
      where d.file_path = _name
        and d.org_id is not null
        and d.org_id = public.current_user_org_id()
    )
$$;

create or replace function public.storage_library_in_my_org(_bucket text, _name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select split_part(coalesce(_name,''), '/', 1) = public.current_user_org_id()::text
    or (
      _bucket = 'important-documents' and exists (
        select 1 from public.important_documents d
        where d.file_path = _name and d.org_id is not null
          and d.org_id = public.current_user_org_id())
    )
    or (
      _bucket = 'training-library' and exists (
        select 1 from public.training_documents d
        where d.file_path = _name and d.org_id is not null
          and d.org_id = public.current_user_org_id())
    )
$$;

-- exact, identifier-based match between a signed-in client and a document
create or replace function public.client_can_read_client_document(_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
    from public.client_accounts ca
    join public.client_documents cd
      on cd.fub_person_id is not null
     and ca.fub_person_id is not null
     and cd.fub_person_id = ca.fub_person_id
     and cd.org_id is not null
     and ca.org_id is not null
     and cd.org_id = ca.org_id
    where ca.user_id = auth.uid()
      and cd.file_path = _name
  )
$$;

create or replace function public.client_matches_document(_fub_person_id integer, _org_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select _fub_person_id is not null and _org_id is not null and exists (
    select 1 from public.client_accounts ca
    where ca.user_id = auth.uid()
      and ca.fub_person_id is not null
      and ca.fub_person_id = _fub_person_id
      and ca.org_id = _org_id
  )
$$;

create or replace function public.client_can_view_avatar(_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.client_accounts ca
    where ca.user_id = auth.uid()
      and ca.invited_by is not null
      and ca.invited_by = public.storage_path_uuid(_name, 1)
  )
$$;

revoke all on function public.storage_path_uuid(text, int) from anon, authenticated, public;
revoke all on function public.storage_owner_in_my_org(text) from anon, public;
revoke all on function public.storage_client_doc_in_my_org(text) from anon, public;
revoke all on function public.storage_library_in_my_org(text, text) from anon, public;
revoke all on function public.client_can_read_client_document(text) from anon, public;
revoke all on function public.client_matches_document(integer, uuid) from anon, public;
revoke all on function public.client_can_view_avatar(text) from anon, public;
grant execute on function public.storage_owner_in_my_org(text) to authenticated;
grant execute on function public.storage_client_doc_in_my_org(text) to authenticated;
grant execute on function public.storage_library_in_my_org(text, text) to authenticated;
grant execute on function public.client_can_read_client_document(text) to authenticated;
grant execute on function public.client_matches_document(integer, uuid) to authenticated;
grant execute on function public.client_can_view_avatar(text) to authenticated;

-- ============ client_documents table: exact matching only ============
drop policy if exists "Clients can view their own documents" on public.client_documents;
create policy "Clients can view documents matched to them"
on public.client_documents for select to authenticated
using (public.client_matches_document(fub_person_id, org_id));

-- ============ storage: agent-documents ============
drop policy if exists "Admins can view all agent documents" on storage.objects;
drop policy if exists "Admins can delete any agent documents" on storage.objects;
drop policy if exists "Admins can upload agent documents for any user" on storage.objects;

create policy "Admins view agent documents in their org"
on storage.objects for select to authenticated
using (bucket_id = 'agent-documents' and public.is_admin_or_owner(auth.uid()) and public.storage_owner_in_my_org(name));

create policy "Admins delete agent documents in their org"
on storage.objects for delete to authenticated
using (bucket_id = 'agent-documents' and public.is_admin_or_owner(auth.uid()) and public.storage_owner_in_my_org(name));

create policy "Admins upload agent documents in their org"
on storage.objects for insert to authenticated
with check (bucket_id = 'agent-documents' and public.is_admin_or_owner(auth.uid()) and public.storage_owner_in_my_org(name));

-- ============ storage: client-documents ============
drop policy if exists "Admins can view all client document files" on storage.objects;
drop policy if exists "Admins can delete any client document files" on storage.objects;
drop policy if exists "Clients can download their documents" on storage.objects;

create policy "Admins view client documents in their org"
on storage.objects for select to authenticated
using (bucket_id = 'client-documents' and public.is_admin_or_owner(auth.uid()) and public.storage_client_doc_in_my_org(name));

create policy "Admins delete client documents in their org"
on storage.objects for delete to authenticated
using (bucket_id = 'client-documents' and public.is_admin_or_owner(auth.uid()) and public.storage_client_doc_in_my_org(name));

create policy "Clients download documents matched to them"
on storage.objects for select to authenticated
using (bucket_id = 'client-documents' and public.client_can_read_client_document(name));

-- ============ storage: important-documents ============
drop policy if exists "Same-org users can view important documents storage" on storage.objects;
drop policy if exists "Admins can upload important documents storage" on storage.objects;
drop policy if exists "Admins can update important documents storage" on storage.objects;
drop policy if exists "Admins can delete important documents storage" on storage.objects;

create policy "Team members view important documents in their org"
on storage.objects for select to authenticated
using (bucket_id = 'important-documents' and public.is_team_member(auth.uid())
       and public.storage_library_in_my_org('important-documents', name));

create policy "Admins upload important documents in their org"
on storage.objects for insert to authenticated
with check (bucket_id = 'important-documents' and public.is_admin_or_owner(auth.uid())
            and split_part(name, '/', 1) = public.current_user_org_id()::text);

create policy "Admins update important documents in their org"
on storage.objects for update to authenticated
using (bucket_id = 'important-documents' and public.is_admin_or_owner(auth.uid())
       and public.storage_library_in_my_org('important-documents', name));

create policy "Admins delete important documents in their org"
on storage.objects for delete to authenticated
using (bucket_id = 'important-documents' and public.is_admin_or_owner(auth.uid())
       and public.storage_library_in_my_org('important-documents', name));

-- ============ storage: training-library ============
drop policy if exists "Same-org users can view training files" on storage.objects;
drop policy if exists "Authenticated users can upload training files" on storage.objects;
drop policy if exists "Admins can delete training files" on storage.objects;

create policy "Team members view training files in their org"
on storage.objects for select to authenticated
using (bucket_id = 'training-library' and public.is_team_member(auth.uid())
       and public.storage_library_in_my_org('training-library', name));

create policy "Team members upload training files in their org"
on storage.objects for insert to authenticated
with check (bucket_id = 'training-library' and public.is_team_member(auth.uid())
            and split_part(name, '/', 1) = public.current_user_org_id()::text);

create policy "Admins delete training files in their org"
on storage.objects for delete to authenticated
using (bucket_id = 'training-library' and public.is_admin_or_owner(auth.uid())
       and public.storage_library_in_my_org('training-library', name));

-- ============ storage: cma-documents ============
drop policy if exists "Users can view CMA docs" on storage.objects;
drop policy if exists "Users can delete CMA docs" on storage.objects;

create policy "Users view CMA docs in their org"
on storage.objects for select to authenticated
using (bucket_id = 'cma-documents'
       and (auth.uid()::text = (storage.foldername(name))[1]
            or (public.is_admin_or_owner(auth.uid()) and public.storage_owner_in_my_org(name))));

create policy "Users delete CMA docs in their org"
on storage.objects for delete to authenticated
using (bucket_id = 'cma-documents'
       and (auth.uid()::text = (storage.foldername(name))[1]
            or (public.is_admin_or_owner(auth.uid()) and public.storage_owner_in_my_org(name))));

-- ============ storage: onboarding-logos (no anonymous uploads) ============
drop policy if exists "Anyone can upload an onboarding logo" on storage.objects;

-- ============ storage: avatars ============
drop policy if exists "Signed-in users can view headshots" on storage.objects;
create policy "Teammates and own clients can view headshots"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (public.is_team_member(auth.uid()) and public.storage_owner_in_my_org(name))
    or public.client_can_view_avatar(name)
  )
);

-- ============ SECURITY DEFINER exposure ============
revoke all on function public.org_has_integration(text) from anon;
revoke all on function public.portal_object_accessible(text) from anon;
revoke all on function public.user_in_my_org(uuid) from anon;
revoke all on function public.guard_profile_org_id() from anon, authenticated, public;

create or replace function public.increment_cma_version(report_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
BEGIN
  UPDATE public.cma_reports
  SET version_number = version_number + 1
  WHERE id = report_id
    AND org_id IS NOT NULL
    AND org_id = public.current_user_org_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CMA report not found in your team';
  END IF;
END;
$$;
