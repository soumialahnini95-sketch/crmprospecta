-- Webora CRM — attribution des prospects aux membres de l’équipe.
-- À exécuter dans le SQL Editor du même projet Supabase que l’application.
-- Cette migration ajoute une colonne nullable et ne modifie aucune fiche existante.

DO $$
BEGIN
  IF to_regclass('public.prospects') IS NULL THEN
    RAISE EXCEPTION 'public.prospects does not exist; run supabase/schema.sql first.';
  END IF;
  IF to_regclass('public.crm_members') IS NULL THEN
    RAISE EXCEPTION 'public.crm_members does not exist; run supabase/schema.sql first.';
  END IF;
  IF to_regprocedure('public.current_crm_role()') IS NULL THEN
    RAISE EXCEPTION 'public.current_crm_role() does not exist; run supabase/schema.sql first.';
  END IF;
END
$$;

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS assigned_to text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'prospects'
      AND column_name = 'assigned_to'
      AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'public.prospects.assigned_to must be TEXT to reference public.crm_members.email.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.prospects'::regclass
      AND conname = 'prospects_assigned_to_crm_members_fk'
  ) THEN
    ALTER TABLE public.prospects
      ADD CONSTRAINT prospects_assigned_to_crm_members_fk
      FOREIGN KEY (assigned_to)
      REFERENCES public.crm_members(email)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS prospects_assigned_to_idx
  ON public.prospects (assigned_to);

-- Supprime les éventuels anciens grants larges; l’assignation reste exclusivement via la RPC.
REVOKE UPDATE ON TABLE public.prospects FROM public, anon, authenticated;
REVOKE UPDATE (id, entreprise, telephone, ville, status, created_at, user_id, assigned_to)
  ON TABLE public.prospects FROM public, anon, authenticated;
GRANT UPDATE (entreprise, telephone, ville, status)
  ON TABLE public.prospects TO authenticated;

-- Les éditeurs/administrateurs consultent la liste via RPC, sans ouvrir crm_members en lecture directe.
CREATE OR REPLACE FUNCTION public.list_crm_members_for_assignment()
RETURNS TABLE(email text, role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resolved_crm_role text := public.current_crm_role();
BEGIN
  IF resolved_crm_role IS NULL OR resolved_crm_role NOT IN ('admin', 'editor') THEN
    RAISE EXCEPTION 'CRM assignment permission required' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT m.email, m.role
    FROM public.crm_members AS m
    ORDER BY m.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_crm_members_for_assignment() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_crm_members_for_assignment() TO authenticated;

-- Le SECURITY DEFINER valide explicitement la session, le rôle et l’adresse membre cible.
CREATE OR REPLACE FUNCTION public.assign_prospect(p_prospect_id uuid, p_assigned_to text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  authenticated_user_id uuid := auth.uid();
  resolved_crm_role text := public.current_crm_role();
  normalized_assignee text := nullif(lower(btrim(coalesce(p_assigned_to, ''))), '');
BEGIN
  IF authenticated_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '42501';
  END IF;
  IF resolved_crm_role IS NULL OR resolved_crm_role NOT IN ('admin', 'editor') THEN
    RAISE EXCEPTION 'CRM assignment permission required' USING errcode = '42501';
  END IF;
  IF normalized_assignee IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_members AS m WHERE m.email = normalized_assignee
  ) THEN
    RAISE EXCEPTION 'Assigned member is not authorized for this CRM' USING errcode = '22023';
  END IF;

  UPDATE public.prospects AS p
  SET assigned_to = normalized_assignee
  WHERE p.id = p_prospect_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prospect not found' USING errcode = 'P0002';
  END IF;
  RETURN p_prospect_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_prospect(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assign_prospect(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Résultat de contrôle : huit colonnes attendues (les sept historiques et assigned_to).
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'prospects'
ORDER BY ordinal_position;
