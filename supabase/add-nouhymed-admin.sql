-- Accorder à nouhymed@gmail.com les mêmes permissions administrateur que les autres membres Webora.
-- À exécuter dans le SQL Editor du projet Supabase utilisé par Webora.
-- Ce script ne crée ni ne modifie aucun utilisateur Supabase Auth ou prospect.

DO $$
BEGIN
  IF to_regclass('public.crm_members') IS NULL THEN
    RAISE EXCEPTION 'La table public.crm_members est absente. Exécutez d’abord supabase/schema.sql.';
  END IF;
END;
$$;

INSERT INTO public.crm_members (email, role)
VALUES ('nouhymed@gmail.com', 'admin')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;

SELECT
  m.email,
  m.role AS stored_role,
  (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
  CASE
    WHEN u.email_confirmed_at IS NOT NULL THEN m.role
    ELSE NULL
  END AS role_after_confirmation
FROM public.crm_members AS m
LEFT JOIN auth.users AS u ON lower(btrim(u.email)) = m.email
WHERE m.email = 'nouhymed@gmail.com';
