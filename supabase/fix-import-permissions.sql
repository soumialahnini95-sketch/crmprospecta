-- Correctif ciblé de permissions d’édition et d’import CSV/Excel Webora.
-- À exécuter dans le SQL Editor du même projet Supabase que celui configuré dans Webora.
-- Ce script ne crée, ne modifie et ne supprime aucun prospect.

DO $$
BEGIN
  IF to_regclass('public.prospects') IS NULL
     OR to_regclass('public.prospect_secteurs') IS NULL
     OR to_regclass('public.crm_members') IS NULL THEN
    RAISE EXCEPTION 'Le schéma Webora de base est incomplet. Exécutez d’abord supabase/schema.sql.';
  END IF;
END;
$$;

-- Les quatre adresses explicitement autorisées par Webora ont le rôle administrateur.
INSERT INTO public.crm_members (email, role)
VALUES
  ('hindbenmalha06@gmail.com', 'admin'),
  ('soumia.lahnini95@gmail.com', 'admin'),
  ('meryemchahlane@gmail.com', 'admin'),
  ('nouhymed@gmail.com', 'admin')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;

-- Recalculer le rôle effectif depuis l’adresse confirmée de la session courante.
-- Un ancien propriétaire non membre conserve uniquement le rôle owner sur ses propres fiches.
CREATE OR REPLACE FUNCTION public.current_crm_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  current_email text;
  member_role text;
BEGIN
  IF current_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.email INTO current_email
  FROM auth.users AS u
  WHERE u.id = current_user_id
    AND u.email_confirmed_at IS NOT NULL;

  IF current_email IS NOT NULL THEN
    SELECT m.role INTO member_role
    FROM public.crm_members AS m
    WHERE m.email = lower(btrim(current_email))
    LIMIT 1;
    IF member_role IS NOT NULL THEN
      RETURN member_role;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.prospects AS p
    WHERE p.user_id = current_user_id
  ) THEN
    RETURN 'owner';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.current_crm_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_crm_role() TO authenticated;

-- La sauvegarde et l’import utilisent un nom distinct du mot spécial CURRENT_ROLE.
CREATE OR REPLACE FUNCTION public.save_prospect(
  p_prospect_id uuid,
  p_entreprise text,
  p_telephone text,
  p_ville text,
  p_status text,
  p_secteur text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  resolved_crm_role text := public.current_crm_role();
  saved_id uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '42501';
  END IF;
  IF resolved_crm_role IS NULL OR resolved_crm_role NOT IN ('admin', 'editor', 'owner') THEN
    RAISE EXCEPTION 'CRM edit permission required' USING errcode = '42501';
  END IF;
  IF nullif(btrim(coalesce(p_entreprise, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Entreprise is required' USING errcode = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('À contacter', 'Contact initial', 'En discussion', 'Démo planifiée', 'C''est OK', 'Perdu') THEN
    RAISE EXCEPTION 'Unsupported prospect status' USING errcode = '22023';
  END IF;

  IF p_prospect_id IS NULL THEN
    INSERT INTO public.prospects (entreprise, telephone, ville, status, user_id)
    VALUES (
      btrim(p_entreprise),
      nullif(btrim(coalesce(p_telephone, '')), ''),
      nullif(btrim(coalesce(p_ville, '')), ''),
      p_status,
      current_user_id
    ) RETURNING id INTO saved_id;
  ELSE
    UPDATE public.prospects AS p
    SET entreprise = btrim(p_entreprise),
        telephone = nullif(btrim(coalesce(p_telephone, '')), ''),
        ville = nullif(btrim(coalesce(p_ville, '')), ''),
        status = p_status
    WHERE p.id = p_prospect_id
    RETURNING p.id INTO saved_id;
    IF saved_id IS NULL THEN
      RAISE EXCEPTION 'Prospect not found or edit permission required' USING errcode = 'P0002';
    END IF;
  END IF;

  IF nullif(btrim(coalesce(p_secteur, '')), '') IS NULL THEN
    DELETE FROM public.prospect_secteurs WHERE prospect_id = saved_id;
  ELSE
    INSERT INTO public.prospect_secteurs (prospect_id, secteur)
    VALUES (saved_id, btrim(p_secteur))
    ON CONFLICT (prospect_id) DO UPDATE SET secteur = EXCLUDED.secteur;
  END IF;
  RETURN saved_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_prospect(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_prospect(uuid, text, text, text, text, text) TO authenticated;

-- Le rôle owner peut importer ses propres fiches; RLS continue d’isoler user_id.
-- DROP permet aussi de remplacer une ancienne version qui retournait un entier au lieu des UUID.
DROP FUNCTION IF EXISTS public.import_prospects(jsonb);
CREATE FUNCTION public.import_prospects(prospect_rows jsonb)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  item jsonb;
  inserted_id uuid;
  current_user_id uuid := auth.uid();
  resolved_crm_role text := public.current_crm_role();
  row_entreprise text;
  row_status text;
  inserted_ids uuid[] := array[]::uuid[];
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '42501';
  END IF;
  IF resolved_crm_role IS NULL OR resolved_crm_role NOT IN ('admin', 'editor', 'owner') THEN
    RAISE EXCEPTION 'CRM edit permission required' USING errcode = '42501';
  END IF;
  IF jsonb_typeof(prospect_rows) <> 'array' THEN
    RAISE EXCEPTION 'prospect_rows must be a JSON array' USING errcode = '22023';
  END IF;

  FOR item IN
    SELECT value FROM jsonb_array_elements(prospect_rows) AS input(value)
  LOOP
    row_entreprise := nullif(btrim(coalesce(item->>'entreprise', '')), '');
    IF row_entreprise IS NULL THEN
      RAISE EXCEPTION 'Each prospect requires entreprise' USING errcode = '22023';
    END IF;

    row_status := coalesce(nullif(btrim(item->>'status'), ''), 'À contacter');
    IF row_status NOT IN ('À contacter', 'Contact initial', 'En discussion', 'Démo planifiée', 'C''est OK', 'Perdu') THEN
      RAISE EXCEPTION 'Unsupported prospect status' USING errcode = '22023';
    END IF;

    INSERT INTO public.prospects (entreprise, telephone, ville, status, user_id)
    VALUES (
      row_entreprise,
      nullif(btrim(coalesce(item->>'telephone', '')), ''),
      nullif(btrim(coalesce(item->>'ville', '')), ''),
      row_status,
      current_user_id
    )
    RETURNING id INTO inserted_id;

    IF nullif(btrim(coalesce(item->>'secteur', '')), '') IS NOT NULL THEN
      INSERT INTO public.prospect_secteurs (prospect_id, secteur)
      VALUES (inserted_id, btrim(item->>'secteur'));
    END IF;

    inserted_ids := array_append(inserted_ids, inserted_id);
  END LOOP;

  RETURN inserted_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.import_prospects(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_prospects(jsonb) TO authenticated;

-- Diagnostic en lecture seule. La ligne SQL_EDITOR_CONTEXT décrit le contexte
-- de cette exécution; auth.uid() y est normalement NULL dans le SQL Editor.
-- Les lignes AUTHORIZED_ACCOUNT indiquent le rôle attendu pour chaque compte
-- une fois connecté à Webora avec cette adresse confirmée.
SELECT
  'SQL_EDITOR_CONTEXT'::text AS diagnostic_type,
  auth.uid()::text AS user_id,
  auth.jwt() ->> 'email' AS email,
  NULL::text AS stored_role,
  NULL::boolean AS email_confirmed,
  public.current_crm_role() AS role_result_or_expected,
  position('email_confirmed_at' IN pg_get_functiondef('public.current_crm_role()'::regprocedure)) > 0 AS role_resolver_checks_confirmation,
  position('owner' IN pg_get_functiondef('public.import_prospects(jsonb)'::regprocedure)) > 0 AS import_allows_owner,
  position('resolved_crm_role' IN pg_get_functiondef('public.save_prospect(uuid, text, text, text, text, text)'::regprocedure)) > 0 AS save_rpc_uses_resolved_role,
  position('resolved_crm_role' IN pg_get_functiondef('public.import_prospects(jsonb)'::regprocedure)) > 0 AS import_rpc_uses_resolved_role
UNION ALL
SELECT
  'AUTHORIZED_ACCOUNT'::text AS diagnostic_type,
  u.id::text AS user_id,
  m.email,
  m.role AS stored_role,
  (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
  CASE
    WHEN u.email_confirmed_at IS NOT NULL AND m.role IS NOT NULL THEN m.role
    WHEN EXISTS (SELECT 1 FROM public.prospects AS p WHERE p.user_id = u.id) THEN 'owner'
    ELSE NULL
  END AS role_result_or_expected,
  position('email_confirmed_at' IN pg_get_functiondef('public.current_crm_role()'::regprocedure)) > 0 AS role_resolver_checks_confirmation,
  position('owner' IN pg_get_functiondef('public.import_prospects(jsonb)'::regprocedure)) > 0 AS import_allows_owner,
  position('resolved_crm_role' IN pg_get_functiondef('public.save_prospect(uuid, text, text, text, text, text)'::regprocedure)) > 0 AS save_rpc_uses_resolved_role,
  position('resolved_crm_role' IN pg_get_functiondef('public.import_prospects(jsonb)'::regprocedure)) > 0 AS import_rpc_uses_resolved_role
FROM public.crm_members AS m
LEFT JOIN auth.users AS u ON lower(btrim(u.email)) = m.email
WHERE m.email IN (
  'hindbenmalha06@gmail.com',
  'soumia.lahnini95@gmail.com',
  'meryemchahlane@gmail.com',
  'nouhymed@gmail.com'
)
ORDER BY diagnostic_type, email;
