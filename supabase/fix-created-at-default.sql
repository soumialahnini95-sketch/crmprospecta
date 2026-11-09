-- Les prospects existants dont created_at est NULL ou vaut l’époque Unix ne sont pas réécrits.
-- Ce script garantit seulement une date réelle par défaut pour les prochains prospects.

DO $$
DECLARE
  created_at_type text;
BEGIN
  IF to_regclass('public.prospects') IS NULL THEN
    RAISE EXCEPTION 'La table public.prospects est absente.';
  END IF;

  SELECT data_type INTO created_at_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'prospects'
    AND column_name = 'created_at';

  IF created_at_type IS NULL THEN
    RAISE EXCEPTION 'La colonne public.prospects.created_at est absente.';
  END IF;
  IF created_at_type NOT IN ('timestamp without time zone', 'timestamp with time zone') THEN
    RAISE EXCEPTION 'Type inattendu pour created_at: %.', created_at_type;
  END IF;
END;
$$;

ALTER TABLE public.prospects
  ALTER COLUMN created_at SET DEFAULT now();

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'prospects'
  AND column_name = 'created_at';
