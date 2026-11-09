-- Webora CRM — à exécuter dans le SQL Editor du projet Supabase.
-- Les sept champs de base restent inchangés; assigned_to est l'extension d'attribution demandée.
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  entreprise text not null,
  telephone text,
  ville text,
  status text not null default 'À contacter',
  created_at timestamp not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_to text
);

-- Les anciennes versions pouvaient ajouter city/company_name/phone en doublon.
-- On archive ces valeurs hors d'accès client, remplit les champs canoniques,
-- puis retire uniquement ces trois alias connus. Les conflits bloquent sans changement.
do $$
declare
  legacy_count integer;
  company_conflicts integer;
  phone_conflicts integer;
  city_conflicts integer;
  unexpected_columns text[];
begin
  select count(*) into legacy_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'prospects'
    and column_name in ('company_name', 'phone', 'city');

  if legacy_count = 0 then
    null;
  elsif legacy_count <> 3 then
    raise exception 'Found only % of the three known legacy columns; no columns were changed.', legacy_count;
  else
    select array_agg(a.attname::text order by a.attname::text)
      into unexpected_columns
    from pg_attribute a
    where a.attrelid = 'public.prospects'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attname not in ('id', 'entreprise', 'telephone', 'ville', 'status', 'created_at', 'user_id', 'assigned_to', 'company_name', 'phone', 'city');

    if unexpected_columns is not null then
      raise exception 'Unexpected extra columns %; no legacy columns were changed.', unexpected_columns;
    end if;

    select count(*) into company_conflicts
    from public.prospects p
    where nullif(btrim(p.entreprise), '') is not null
      and nullif(btrim(p.company_name::text), '') is not null
      and lower(btrim(p.entreprise)) <> lower(btrim(p.company_name::text));

    with phone_values as (
      select
        regexp_replace(coalesce(p.telephone::text, ''), '[^0-9]', '', 'g') as canonical_digits,
        regexp_replace(coalesce(p.phone::text, ''), '[^0-9]', '', 'g') as legacy_digits,
        nullif(btrim(p.telephone::text), '') is not null as canonical_present,
        nullif(btrim(p.phone::text), '') is not null as legacy_present
      from public.prospects p
    ), normalized as (
      select
        regexp_replace(case when canonical_digits like '00212%' then substring(canonical_digits from 6) when canonical_digits like '212%' then substring(canonical_digits from 4) else canonical_digits end, '^0', '') as canonical_phone,
        regexp_replace(case when legacy_digits like '00212%' then substring(legacy_digits from 6) when legacy_digits like '212%' then substring(legacy_digits from 4) else legacy_digits end, '^0', '') as legacy_phone,
        canonical_present,
        legacy_present
      from phone_values
    )
    select count(*) into phone_conflicts
    from normalized
    where canonical_present and legacy_present
      and (canonical_phone = '' or legacy_phone = '' or canonical_phone <> legacy_phone);

    select count(*) into city_conflicts
    from public.prospects p
    where nullif(btrim(p.ville), '') is not null
      and nullif(btrim(p.city::text), '') is not null
      and lower(btrim(p.ville)) <> lower(btrim(p.city::text));

    if company_conflicts > 0 or phone_conflicts > 0 or city_conflicts > 0 then
      raise exception 'Legacy data conflicts found (company %, phone %, city %); no legacy columns were changed. Review the conflicting rows before retrying.', company_conflicts, phone_conflicts, city_conflicts;
    end if;

    create table if not exists public.prospects_legacy_columns_backup (
      id uuid primary key,
      archived_at timestamp with time zone not null default now(),
      user_id uuid,
      company_name text,
      phone text,
      city text
    );
    alter table public.prospects_legacy_columns_backup enable row level security;
    revoke all on table public.prospects_legacy_columns_backup from public, anon, authenticated;

    insert into public.prospects_legacy_columns_backup (id, archived_at, user_id, company_name, phone, city)
    select p.id, now(), p.user_id, p.company_name::text, p.phone::text, p.city::text
    from public.prospects p
    on conflict (id) do update set
      archived_at = excluded.archived_at,
      user_id = excluded.user_id,
      company_name = excluded.company_name,
      phone = excluded.phone,
      city = excluded.city;

    update public.prospects p
    set entreprise = coalesce(nullif(btrim(p.entreprise), ''), nullif(btrim(p.company_name::text), ''), p.entreprise),
        telephone = coalesce(nullif(btrim(p.telephone), ''), nullif(btrim(p.phone::text), ''), p.telephone),
        ville = coalesce(nullif(btrim(p.ville), ''), nullif(btrim(p.city::text), ''), p.ville);

    alter table public.prospects
      drop column company_name,
      drop column phone,
      drop column city;
  end if;
end
$$;

-- Extension nullable : les anciennes fiches restent non assignées et intactes.
alter table public.prospects add column if not exists assigned_to text;

-- Les seuls alias connus sont archivés ci-dessus; toute autre colonne ou tout type inattendu
-- arrête le script avant l'activation des politiques RLS.
do $$
declare
  actual_columns text[];
  expected_columns text[] := array['assigned_to', 'created_at', 'entreprise', 'id', 'status', 'telephone', 'user_id', 'ville']::text[];
begin
  select array_agg(a.attname::text order by a.attname::text)
    into actual_columns
  from pg_attribute a
  where a.attrelid = 'public.prospects'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  if actual_columns is distinct from expected_columns then
    raise exception 'public.prospects must contain exactly the seven base columns plus assigned_to. Found: %', actual_columns;
  end if;

  if exists (
    select 1
    from (values
      ('id', 'uuid'),
      ('entreprise', 'text'),
      ('telephone', 'text'),
      ('ville', 'text'),
      ('status', 'text'),
      ('created_at', 'timestamp without time zone'),
      ('user_id', 'uuid'),
      ('assigned_to', 'text')
    ) as expected(name, data_type)
    join pg_attribute a
      on a.attrelid = 'public.prospects'::regclass
     and a.attname = expected.name
     and not a.attisdropped
    where not (
      (expected.name = 'created_at'
        and format_type(a.atttypid, a.atttypmod) in ('timestamp without time zone', 'timestamp with time zone'))
      or
      (expected.name <> 'created_at'
        and format_type(a.atttypid, a.atttypmod) = expected.data_type)
    )
  ) then
    raise exception 'public.prospects contains a column with a type different from the requested schema';
  end if;
end
$$;

alter table public.prospects alter column id set default gen_random_uuid();
alter table public.prospects alter column status set default 'À contacter';
alter table public.prospects alter column created_at set default now();

-- Ajoute la clé primaire manquante sur id sans réécrire les lignes.
-- PostgreSQL refusera cette opération si id contient des doublons ou des valeurs NULL.
do $$
declare
  prospects_id_att smallint;
begin
  select attnum into prospects_id_att
  from pg_attribute
  where attrelid = 'public.prospects'::regclass and attname = 'id' and not attisdropped;

  if prospects_id_att is null then
    raise exception 'prospects.id was not found';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.prospects'::regclass
      and c.contype = 'p'
      and c.conkey = array[prospects_id_att]
  ) then
    if exists (
      select 1 from pg_constraint c
      where c.conrelid = 'public.prospects'::regclass and c.contype = 'p'
    ) then
      raise exception 'prospects already has a primary key on a column other than id';
    end if;
    alter table public.prospects add constraint prospects_pkey primary key (id);
  end if;
end
$$;

-- Les lignes historiques ne sont pas réécrites ; la contrainte s'applique aux nouvelles écritures.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.prospects'::regclass
      and conname = 'prospects_status_valid'
  ) then
    alter table public.prospects
      add constraint prospects_status_valid
      check (status in ('À contacter', 'Contact initial', 'En discussion', 'Démo planifiée', 'C''est OK', 'Perdu'))
      not valid;
  end if;
end
$$;

create index if not exists prospects_user_created_idx
  on public.prospects (user_id, created_at desc);
create index if not exists prospects_user_status_idx
  on public.prospects (user_id, status);
create index if not exists prospects_created_at_idx
  on public.prospects (created_at desc);
create index if not exists prospects_assigned_to_idx
  on public.prospects (assigned_to);

-- Métadonnée séparée : conserve le schéma exact de prospects et permet le filtre secteur.
create table if not exists public.prospect_secteurs (
  prospect_id uuid primary key references public.prospects(id) on delete cascade,
  secteur text not null
);

-- Membres autorisés du seul espace partagé Webora; une adresse peut être invitée avant son inscription.
create table if not exists public.crm_members (
  email text primary key check (email = lower(btrim(email))),
  role text not null check (role in ('viewer', 'editor', 'admin')),
  created_at timestamp not null default now(),
  constraint crm_members_email_format check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

-- L'administrateur de départ est le créateur de la fiche la plus ancienne, s'il existe.
insert into public.crm_members (email, role)
select lower(btrim(u.email)), 'admin'
from auth.users u
where u.id = (
  select p.user_id
  from public.prospects p
  where p.user_id is not null
  order by p.created_at asc, p.id asc
  limit 1
  )
  and nullif(btrim(u.email), '') is not null
on conflict (email) do update set role = excluded.role;

-- Les quatre comptes autorisés par Webora sont administrateurs.
insert into public.crm_members (email, role)
values
  ('hindbenmalha06@gmail.com', 'admin'),
  ('soumia.lahnini95@gmail.com', 'admin'),
  ('meryemchahlane@gmail.com', 'admin'),
  ('nouhymed@gmail.com', 'admin')
on conflict (email) do update set role = excluded.role;

-- Le responsable correspond à l'adresse primaire d'un membre Webora.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.prospects'::regclass
      and conname = 'prospects_assigned_to_crm_members_fk'
  ) then
    alter table public.prospects
      add constraint prospects_assigned_to_crm_members_fk
      foreign key (assigned_to) references public.crm_members(email) on delete set null;
  end if;
end
$$;

alter table public.prospects enable row level security;
alter table public.prospect_secteurs enable row level security;
alter table public.crm_members enable row level security;

-- Rôle déterminé depuis l'adresse confirmée Supabase. Un ancien propriétaire non invité
-- conserve uniquement ses propres fiches; il ne voit pas le répertoire partagé.
create or replace function public.current_crm_role()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  member_role text;
begin
  if current_user_id is null then
    return null;
  end if;

  select u.email into current_email
  from auth.users u
  where u.id = current_user_id
    and u.email_confirmed_at is not null;

  if current_email is not null then
    select m.role into member_role
    from public.crm_members m
    where m.email = lower(btrim(current_email))
    limit 1;
    if member_role is not null then
      return member_role;
    end if;
  end if;

  if exists (select 1 from public.prospects p where p.user_id = current_user_id) then
    return 'owner';
  end if;
  return null;
end;
$$;

revoke all on function public.current_crm_role() from public, anon;
grant execute on function public.current_crm_role() to authenticated;

-- Les éditeurs/administrateurs voient la liste des membres via RPC, sans ouvrir crm_members en lecture directe.
create or replace function public.list_crm_members_for_assignment()
returns table(email text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_crm_role text := public.current_crm_role();
begin
  if resolved_crm_role is null or resolved_crm_role not in ('admin', 'editor') then
    raise exception 'CRM assignment permission required' using errcode = '42501';
  end if;
  return query
    select m.email, m.role
    from public.crm_members as m
    order by m.email;
end;
$$;

revoke all on function public.list_crm_members_for_assignment() from public, anon;
grant execute on function public.list_crm_members_for_assignment() to authenticated;

-- Le SECURITY DEFINER ne contourne pas les rôles : il valide la session, le rôle et le membre cible.
create or replace function public.assign_prospect(p_prospect_id uuid, p_assigned_to text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := auth.uid();
  resolved_crm_role text := public.current_crm_role();
  normalized_assignee text := nullif(lower(btrim(coalesce(p_assigned_to, ''))), '');
begin
  if authenticated_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if resolved_crm_role is null or resolved_crm_role not in ('admin', 'editor') then
    raise exception 'CRM assignment permission required' using errcode = '42501';
  end if;
  if normalized_assignee is not null and not exists (
    select 1 from public.crm_members as m where m.email = normalized_assignee
  ) then
    raise exception 'Assigned member is not authorized for this CRM' using errcode = '22023';
  end if;

  update public.prospects as p
  set assigned_to = normalized_assignee
  where p.id = p_prospect_id;
  if not found then
    raise exception 'Prospect not found' using errcode = 'P0002';
  end if;
  return p_prospect_id;
end;
$$;

revoke all on function public.assign_prospect(uuid, text) from public, anon;
grant execute on function public.assign_prospect(uuid, text) to authenticated;

-- Le client peut lire les champs, insérer en son nom, supprimer selon son rôle et modifier
-- uniquement les champs métier; assigned_to reste modifiable via la RPC autorisée ci-dessus.
revoke all on table public.prospects, public.prospect_secteurs, public.crm_members from public, anon;
grant select, insert, delete on table public.prospects to authenticated;
revoke update on table public.prospects from public, anon, authenticated;
revoke update (id, entreprise, telephone, ville, status, created_at, user_id, assigned_to) on public.prospects from public, anon, authenticated;
grant update (entreprise, telephone, ville, status) on public.prospects to authenticated;
grant select, insert, update, delete on table public.prospect_secteurs, public.crm_members to authenticated;

-- RLS de prospects : admin/editor peuvent modifier le répertoire partagé; viewer le lit;
-- un ancien propriétaire non membre ne conserve accès qu'à ses propres lignes.
drop policy if exists "prospects_select_own" on public.prospects;
drop policy if exists "prospects_insert_own" on public.prospects;
drop policy if exists "prospects_update_own" on public.prospects;
drop policy if exists "prospects_delete_own" on public.prospects;
drop policy if exists "prospects_owner_guard" on public.prospects;
drop policy if exists "prospects_select_team" on public.prospects;
drop policy if exists "prospects_insert_team" on public.prospects;
drop policy if exists "prospects_update_team" on public.prospects;
drop policy if exists "prospects_delete_team" on public.prospects;
drop policy if exists "prospects_select_guard" on public.prospects;
drop policy if exists "prospects_insert_guard" on public.prospects;
drop policy if exists "prospects_update_guard" on public.prospects;
drop policy if exists "prospects_delete_guard" on public.prospects;

create policy "prospects_select_team" on public.prospects
  for select to authenticated
  using (
    (select public.current_crm_role()) in ('admin', 'editor', 'viewer')
    or ((select public.current_crm_role()) = 'owner' and user_id = (select auth.uid()))
  );
create policy "prospects_insert_team" on public.prospects
  for insert to authenticated
  with check (
    (select public.current_crm_role()) in ('admin', 'editor', 'owner')
    and user_id = (select auth.uid())
  );
create policy "prospects_update_team" on public.prospects
  for update to authenticated
  using (
    (select public.current_crm_role()) in ('admin', 'editor')
    or ((select public.current_crm_role()) = 'owner' and user_id = (select auth.uid()))
  )
  with check (
    (select public.current_crm_role()) in ('admin', 'editor')
    or ((select public.current_crm_role()) = 'owner' and user_id = (select auth.uid()))
  );
create policy "prospects_delete_team" on public.prospects
  for delete to authenticated
  using (
    (select public.current_crm_role()) = 'admin'
    or ((select public.current_crm_role()) = 'owner' and user_id = (select auth.uid()))
  );

-- Garde restrictive : aucune autre ancienne politique permissive ne peut élargir l'accès.
create policy "prospects_select_guard" on public.prospects
  as restrictive for select to public
  using (
    (select public.current_crm_role()) in ('admin', 'editor', 'viewer')
    or ((select public.current_crm_role()) = 'owner' and user_id = (select auth.uid()))
  );
create policy "prospects_insert_guard" on public.prospects
  as restrictive for insert to public
  with check (
    (select public.current_crm_role()) in ('admin', 'editor', 'owner')
    and user_id = (select auth.uid())
  );
create policy "prospects_update_guard" on public.prospects
  as restrictive for update to public
  using (
    (select public.current_crm_role()) in ('admin', 'editor')
    or ((select public.current_crm_role()) = 'owner' and user_id = (select auth.uid()))
  )
  with check (
    (select public.current_crm_role()) in ('admin', 'editor')
    or ((select public.current_crm_role()) = 'owner' and user_id = (select auth.uid()))
  );
create policy "prospects_delete_guard" on public.prospects
  as restrictive for delete to public
  using (
    (select public.current_crm_role()) = 'admin'
    or ((select public.current_crm_role()) = 'owner' and user_id = (select auth.uid()))
  );

-- Les secteurs suivent les droits RLS de la fiche parente; les éditeurs peuvent vider un secteur.
drop policy if exists "prospect_secteurs_select_own" on public.prospect_secteurs;
drop policy if exists "prospect_secteurs_insert_own" on public.prospect_secteurs;
drop policy if exists "prospect_secteurs_update_own" on public.prospect_secteurs;
drop policy if exists "prospect_secteurs_delete_own" on public.prospect_secteurs;
drop policy if exists "prospect_secteurs_owner_guard" on public.prospect_secteurs;
drop policy if exists "prospect_secteurs_select_team" on public.prospect_secteurs;
drop policy if exists "prospect_secteurs_insert_team" on public.prospect_secteurs;
drop policy if exists "prospect_secteurs_update_team" on public.prospect_secteurs;
drop policy if exists "prospect_secteurs_delete_team" on public.prospect_secteurs;
drop policy if exists "prospect_secteurs_select_guard" on public.prospect_secteurs;
drop policy if exists "prospect_secteurs_insert_guard" on public.prospect_secteurs;
drop policy if exists "prospect_secteurs_update_guard" on public.prospect_secteurs;
drop policy if exists "prospect_secteurs_delete_guard" on public.prospect_secteurs;

create policy "prospect_secteurs_select_team" on public.prospect_secteurs
  for select to authenticated using (exists (select 1 from public.prospects p where p.id = prospect_id));
create policy "prospect_secteurs_insert_team" on public.prospect_secteurs
  for insert to authenticated with check (
    (select public.current_crm_role()) in ('admin', 'editor', 'owner')
    and exists (select 1 from public.prospects p where p.id = prospect_id)
  );
create policy "prospect_secteurs_update_team" on public.prospect_secteurs
  for update to authenticated
  using (
    (select public.current_crm_role()) in ('admin', 'editor', 'owner')
    and exists (select 1 from public.prospects p where p.id = prospect_id)
  )
  with check (
    (select public.current_crm_role()) in ('admin', 'editor', 'owner')
    and exists (select 1 from public.prospects p where p.id = prospect_id)
  );
create policy "prospect_secteurs_delete_team" on public.prospect_secteurs
  for delete to authenticated
  using (
    (select public.current_crm_role()) in ('admin', 'editor', 'owner')
    and exists (select 1 from public.prospects p where p.id = prospect_id)
  );

create policy "prospect_secteurs_select_guard" on public.prospect_secteurs
  as restrictive for select to public
  using (exists (select 1 from public.prospects p where p.id = prospect_id));
create policy "prospect_secteurs_insert_guard" on public.prospect_secteurs
  as restrictive for insert to public
  with check (
    (select public.current_crm_role()) in ('admin', 'editor', 'owner')
    and exists (select 1 from public.prospects p where p.id = prospect_id)
  );
create policy "prospect_secteurs_update_guard" on public.prospect_secteurs
  as restrictive for update to public
  using (
    (select public.current_crm_role()) in ('admin', 'editor', 'owner')
    and exists (select 1 from public.prospects p where p.id = prospect_id)
  )
  with check (
    (select public.current_crm_role()) in ('admin', 'editor', 'owner')
    and exists (select 1 from public.prospects p where p.id = prospect_id)
  );
create policy "prospect_secteurs_delete_guard" on public.prospect_secteurs
  as restrictive for delete to public
  using (
    (select public.current_crm_role()) in ('admin', 'editor', 'owner')
    and exists (select 1 from public.prospects p where p.id = prospect_id)
  );

-- Seuls les administrateurs consultent ou gèrent les adresses et les rôles.
drop policy if exists "crm_members_admin" on public.crm_members;
drop policy if exists "crm_members_admin_guard" on public.crm_members;
create policy "crm_members_admin" on public.crm_members
  for all to authenticated
  using ((select public.current_crm_role()) = 'admin')
  with check ((select public.current_crm_role()) = 'admin');
create policy "crm_members_admin_guard" on public.crm_members
  as restrictive for all to public
  using ((select public.current_crm_role()) = 'admin')
  with check ((select public.current_crm_role()) = 'admin');

-- Sauvegarde d'une fiche et de son secteur dans une même transaction.
create or replace function public.save_prospect(
  p_prospect_id uuid,
  p_entreprise text,
  p_telephone text,
  p_ville text,
  p_status text,
  p_secteur text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  resolved_crm_role text := public.current_crm_role();
  saved_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if resolved_crm_role is null or resolved_crm_role not in ('admin', 'editor', 'owner') then
    raise exception 'CRM edit permission required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_entreprise, '')), '') is null then
    raise exception 'Entreprise is required' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('À contacter', 'Contact initial', 'En discussion', 'Démo planifiée', 'C''est OK', 'Perdu') then
    raise exception 'Unsupported prospect status' using errcode = '22023';
  end if;

  if p_prospect_id is null then
    insert into public.prospects (entreprise, telephone, ville, status, user_id)
    values (
      btrim(p_entreprise),
      nullif(btrim(coalesce(p_telephone, '')), ''),
      nullif(btrim(coalesce(p_ville, '')), ''),
      p_status,
      current_user_id
    ) returning id into saved_id;
  else
    update public.prospects as p
    set entreprise = btrim(p_entreprise),
        telephone = nullif(btrim(coalesce(p_telephone, '')), ''),
        ville = nullif(btrim(coalesce(p_ville, '')), ''),
        status = p_status
    where p.id = p_prospect_id
    returning p.id into saved_id;
    if saved_id is null then
      raise exception 'Prospect not found or edit permission required' using errcode = 'P0002';
    end if;
  end if;

  if nullif(btrim(coalesce(p_secteur, '')), '') is null then
    delete from public.prospect_secteurs where prospect_id = saved_id;
  else
    insert into public.prospect_secteurs (prospect_id, secteur)
    values (saved_id, btrim(p_secteur))
    on conflict (prospect_id) do update set secteur = excluded.secteur;
  end if;
  return saved_id;
end;
$$;

revoke all on function public.save_prospect(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.save_prospect(uuid, text, text, text, text, text) to authenticated;

-- Import par lots atomique : retourne les IDs insérés et reste soumis à RLS.
drop function if exists public.import_prospects(jsonb);
create function public.import_prospects(prospect_rows jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  inserted_id uuid;
  current_user_id uuid := auth.uid();
  resolved_crm_role text := public.current_crm_role();
  row_entreprise text;
  row_status text;
  inserted_ids uuid[] := array[]::uuid[];
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if resolved_crm_role is null or resolved_crm_role not in ('admin', 'editor', 'owner') then
    raise exception 'CRM edit permission required' using errcode = '42501';
  end if;
  if jsonb_typeof(prospect_rows) <> 'array' then
    raise exception 'prospect_rows must be a JSON array' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(prospect_rows) as input(value)
  loop
    row_entreprise := nullif(btrim(coalesce(item->>'entreprise', '')), '');
    if row_entreprise is null then
      raise exception 'Each prospect requires entreprise' using errcode = '22023';
    end if;
    row_status := coalesce(nullif(btrim(item->>'status'), ''), 'À contacter');
    if row_status not in ('À contacter', 'Contact initial', 'En discussion', 'Démo planifiée', 'C''est OK', 'Perdu') then
      raise exception 'Unsupported prospect status' using errcode = '22023';
    end if;

    insert into public.prospects (entreprise, telephone, ville, status, user_id)
    values (
      row_entreprise,
      nullif(btrim(coalesce(item->>'telephone', '')), ''),
      nullif(btrim(coalesce(item->>'ville', '')), ''),
      row_status,
      current_user_id
    ) returning id into inserted_id;

    if nullif(btrim(coalesce(item->>'secteur', '')), '') is not null then
      insert into public.prospect_secteurs (prospect_id, secteur)
      values (inserted_id, btrim(item->>'secteur'));
    end if;
    inserted_ids := array_append(inserted_ids, inserted_id);
  end loop;
  return inserted_ids;
end;
$$;

revoke all on function public.import_prospects(jsonb) from public, anon;
grant execute on function public.import_prospects(jsonb) to authenticated;

-- Si prospects préexistait, ajouter le lien auth.users manquant sans réécrire les lignes historiques.
do $$
declare
  prospects_user_id_att smallint;
  auth_users_id_att smallint;
begin
  select attnum into prospects_user_id_att
  from pg_attribute
  where attrelid = 'public.prospects'::regclass and attname = 'user_id' and not attisdropped;
  select attnum into auth_users_id_att
  from pg_attribute
  where attrelid = 'auth.users'::regclass and attname = 'id' and not attisdropped;

  if prospects_user_id_att is null or auth_users_id_att is null then
    raise exception 'prospects.user_id or auth.users.id was not found';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.prospects'::regclass
      and c.confrelid = 'auth.users'::regclass
      and c.contype = 'f'
      and c.conkey = array[prospects_user_id_att]
      and c.confkey = array[auth_users_id_att]
  ) then
    alter table public.prospects
      add constraint prospects_user_id_auth_users_fk
      foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;
end
$$;

notify pgrst, 'reload schema';
