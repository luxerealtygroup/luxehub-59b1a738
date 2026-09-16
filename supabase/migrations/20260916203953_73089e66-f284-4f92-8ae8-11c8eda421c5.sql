
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create or replace function private.storage_path_uuid(_name text, _pos int)
returns uuid language sql immutable set search_path to 'public' as $$
  select case
    when split_part(coalesce(_name,''), '/', _pos) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then split_part(_name, '/', _pos)::uuid
    else null end
$$;

create or replace function private.storage_owner_in_my_org(_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = private.storage_path_uuid(_name, 1)
      and p.org_id is not null
      and p.org_id = public.current_user_org_id()
  )
$$;

create or replace function private.storage_client_doc_in_my_org(_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select private.storage_owner_in_my_org(_name)
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

create or replace function private.storage_library_in_my_org(_bucket text, _name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select split_part(coalesce(_name,''), '/', 1) = public.current_user_org_id()::text
    or (_bucket = 'important-documents' and exists (
      select 1 from public.important_documents d
      where d.file_path = _name and d.org_id is not null
        and d.org_id = public.current_user_org_id()))
    or (_bucket = 'training-library' and exists (
      select 1 from public.training_documents d
      where d.file_path = _name and d.org_id is not null
        and d.org_id = public.current_user_org_id()))
$$;

create or replace function private.client_can_read_client_document(_name text)
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

create or replace function private.client_matches_document(_fub_person_id integer, _org_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select _fub_person_id is not null and _org_id is not null and exists (
    select 1 from public.client_accounts ca
    where ca.user_id = auth.uid()
      and ca.fub_person_id is not null
      and ca.fub_person_id = _fub_person_id
      and ca.org_id = _org_id
  )
$$;

create or replace function private.client_can_view_avatar(_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.client_accounts ca
    where ca.user_id = auth.uid()
      and ca.invited_by is not null
      and ca.invited_by = private.storage_path_uuid(_name, 1)
  )
$$;

grant execute on function private.storage_owner_in_my_org(text),
  private.storage_client_doc_in_my_org(text),
  private.storage_library_in_my_org(text, text),
  private.client_can_read_client_document(text),
  private.client_matches_document(integer, uuid),
  private.client_can_view_avatar(text) to authenticated;

-- repoint policies at the private helpers
drop policy if exists "Clients can view documents matched to them" on public.client_documents;
create policy "Clients can view documents matched to them"
on public.client_documents for select to authenticated
using (private.client_matches_document(fub_person_id, org_id));

drop policy if exists "Admins view agent documents in their org" on storage.objects;
create policy "Admins view agent documents in their org"
on storage.objects for select to authenticated
using (bucket_id = 'agent-documents' and public.is_admin_or_owner(auth.uid()) and private.storage_owner_in_my_org(name));

drop policy if exists "Admins delete agent documents in their org" on storage.objects;
create policy "Admins delete agent documents in their org"
on storage.objects for delete to authenticated
using (bucket_id = 'agent-documents' and public.is_admin_or_owner(auth.uid()) and private.storage_owner_in_my_org(name));

drop policy if exists "Admins upload agent documents in their org" on storage.objects;
create policy "Admins upload agent documents in their org"
on storage.objects for insert to authenticated
with check (bucket_id = 'agent-documents' and public.is_admin_or_owner(auth.uid()) and private.storage_owner_in_my_org(name));

drop policy if exists "Admins view client documents in their org" on storage.objects;
create policy "Admins view client documents in their org"
on storage.objects for select to authenticated
using (bucket_id = 'client-documents' and public.is_admin_or_owner(auth.uid()) and private.storage_client_doc_in_my_org(name));

drop policy if exists "Admins delete client documents in their org" on storage.objects;
create policy "Admins delete client documents in their org"
on storage.objects for delete to authenticated
using (bucket_id = 'client-documents' and public.is_admin_or_owner(auth.uid()) and private.storage_client_doc_in_my_org(name));

drop policy if exists "Clients download documents matched to them" on storage.objects;
create policy "Clients download documents matched to them"
on storage.objects for select to authenticated
using (bucket_id = 'client-documents' and private.client_can_read_client_document(name));

drop policy if exists "Team members view important documents in their org" on storage.objects;
create policy "Team members view important documents in their org"
on storage.objects for select to authenticated
using (bucket_id = 'important-documents' and public.is_team_member(auth.uid())
       and private.storage_library_in_my_org('important-documents', name));

drop policy if exists "Admins update important documents in their org" on storage.objects;
create policy "Admins update important documents in their org"
on storage.objects for update to authenticated
using (bucket_id = 'important-documents' and public.is_admin_or_owner(auth.uid())
       and private.storage_library_in_my_org('important-documents', name));

drop policy if exists "Admins delete important documents in their org" on storage.objects;
create policy "Admins delete important documents in their org"
on storage.objects for delete to authenticated
using (bucket_id = 'important-documents' and public.is_admin_or_owner(auth.uid())
       and private.storage_library_in_my_org('important-documents', name));

drop policy if exists "Team members view training files in their org" on storage.objects;
create policy "Team members view training files in their org"
on storage.objects for select to authenticated
using (bucket_id = 'training-library' and public.is_team_member(auth.uid())
       and private.storage_library_in_my_org('training-library', name));

drop policy if exists "Admins delete training files in their org" on storage.objects;
create policy "Admins delete training files in their org"
on storage.objects for delete to authenticated
using (bucket_id = 'training-library' and public.is_admin_or_owner(auth.uid())
       and private.storage_library_in_my_org('training-library', name));

drop policy if exists "Users view CMA docs in their org" on storage.objects;
create policy "Users view CMA docs in their org"
on storage.objects for select to authenticated
using (bucket_id = 'cma-documents'
       and (auth.uid()::text = (storage.foldername(name))[1]
            or (public.is_admin_or_owner(auth.uid()) and private.storage_owner_in_my_org(name))));

drop policy if exists "Users delete CMA docs in their org" on storage.objects;
create policy "Users delete CMA docs in their org"
on storage.objects for delete to authenticated
using (bucket_id = 'cma-documents'
       and (auth.uid()::text = (storage.foldername(name))[1]
            or (public.is_admin_or_owner(auth.uid()) and private.storage_owner_in_my_org(name))));

drop policy if exists "Teammates and own clients can view headshots" on storage.objects;
create policy "Teammates and own clients can view headshots"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (public.is_team_member(auth.uid()) and private.storage_owner_in_my_org(name))
    or private.client_can_view_avatar(name)
  )
);

drop function if exists public.storage_path_uuid(text, int);
drop function if exists public.storage_owner_in_my_org(text);
drop function if exists public.storage_client_doc_in_my_org(text);
drop function if exists public.storage_library_in_my_org(text, text);
drop function if exists public.client_can_read_client_document(text);
drop function if exists public.client_matches_document(integer, uuid);
drop function if exists public.client_can_view_avatar(text);
