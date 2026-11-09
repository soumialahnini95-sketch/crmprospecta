import { createClient } from "@supabase/supabase-js";

export const PROSPECT_STATUSES = [
  "À contacter",
  "Contact initial",
  "En discussion",
  "Démo planifiée",
  "C'est OK",
  "Perdu",
] as const;

export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export interface ProspectDraft {
  entreprise: string;
  telephone: string;
  ville: string;
  status: ProspectStatus;
  secteur: string;
}

export interface Prospect extends ProspectDraft {
  id: string;
  created_at: string | null;
  user_id: string;
  assigned_to: string | null;
}

declare global {
  interface Window {
    __WEBORA_CONFIG__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    };
  }
}

const config = typeof window === "undefined" ? undefined : window.__WEBORA_CONFIG__;
const supabaseUrl = config?.supabaseUrl?.trim();
const supabaseAnonKey = config?.supabaseAnonKey?.trim();

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

const PAGE_SIZE = 1000;

export function normalizeMoroccanPhone(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  let nationalNumber: string;
  if (digits.startsWith("00212")) nationalNumber = digits.slice(5);
  else if (digits.startsWith("212")) nationalNumber = digits.slice(3);
  else if (digits.startsWith("00") || raw.startsWith("+")) {
    throw new Error("Saisissez un numéro marocain au format +212 6 12 34 56 78 ou 06 12 34 56 78.");
  } else nationalNumber = digits;

  if (nationalNumber.startsWith("0")) nationalNumber = nationalNumber.slice(1);
  return nationalNumber ? `+212${nationalNumber}` : "";
}

function displayMoroccanPhone(value: string | null): string {
  if (!value) return "";
  try {
    return normalizeMoroccanPhone(value);
  } catch {
    return value;
  }
}

type ProspectResponse = {
  id: string;
  entreprise: string;
  telephone: string | null;
  ville: string | null;
  status: string;
  created_at: string | null;
  user_id: string;
  assigned_to?: string | null;
};

function normalizeProspect(row: ProspectResponse, secteur = ""): Prospect {
  const status = PROSPECT_STATUSES.includes(row.status as ProspectStatus)
    ? (row.status as ProspectStatus)
    : "À contacter";
  return {
    id: row.id,
    entreprise: row.entreprise,
    telephone: displayMoroccanPhone(row.telephone),
    ville: row.ville ?? "",
    status,
    created_at: row.created_at,
    user_id: row.user_id,
    assigned_to: row.assigned_to ?? null,
    secteur,
  };
}

function isMissingAssignmentColumn(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate?.code === "string" ? candidate.code : "";
  const message = typeof candidate?.message === "string" ? candidate.message : "";
  return code === "42703" || code === "PGRST204" || /assigned_to.*(column|schema cache)/i.test(message);
}

/** Paginationne tous les prospects autorisés par RLS; avant la migration d’équipe, garde un filtre de compatibilité. */
export async function getAllProspects(userId: string, sharingReady = true): Promise<{ prospects: Prospect[]; sectorTableReady: boolean; assignmentReady: boolean }> {
  if (!supabase) throw new Error("La connexion Supabase n'est pas configurée.");
  const loadRows = async (includeAssignedTo: boolean): Promise<ProspectResponse[]> => {
    const rows: ProspectResponse[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from("prospects")
        .select(includeAssignedTo
          ? "id,entreprise,telephone,ville,status,created_at,user_id,assigned_to"
          : "id,entreprise,telephone,ville,status,created_at,user_id");
      if (!sharingReady) query = query.eq("user_id", userId);
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data ?? []) as unknown as ProspectResponse[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return rows;
  };

  let rows: ProspectResponse[];
  let assignmentReady = true;
  try {
    rows = await loadRows(true);
  } catch (error) {
    if (!isMissingAssignmentColumn(error)) throw error;
    assignmentReady = false;
    rows = await loadRows(false);
  }

  const sectorProbe = await supabase
    .from("prospect_secteurs")
    .select("prospect_id,secteur")
    .limit(0);
  if (sectorProbe.error) {
    if (sectorProbe.error.code === "PGRST205" || sectorProbe.error.code === "42P01") {
      return { prospects: rows.map(row => normalizeProspect(row)), sectorTableReady: false, assignmentReady };
    }
    throw sectorProbe.error;
  }

  const sectors = new Map<string, string>();
  for (let offset = 0; offset < rows.length; offset += 500) {
    const ids = rows.slice(offset, offset + 500).map(row => row.id);
    const { data, error } = await supabase
      .from("prospect_secteurs")
      .select("prospect_id,secteur")
      .in("prospect_id", ids);
    if (error) throw error;
    for (const row of data ?? []) sectors.set(row.prospect_id, row.secteur);
  }
  return {
    prospects: rows.map(row => normalizeProspect(row, sectors.get(row.id) ?? "")),
    sectorTableReady: true,
    assignmentReady,
  };
}

export async function saveProspect(
  userId: string,
  draft: ProspectDraft,
  prospectId?: string,
  sectorTableReady = true,
  sharingReady = true,
): Promise<string> {
  if (!supabase) throw new Error("La connexion Supabase n'est pas configurée.");
  if (!userId) throw new Error("Reconnectez-vous avant d'enregistrer.");
  if (!sectorTableReady && draft.secteur.trim()) {
    throw new Error("Le stockage du secteur n’est pas encore installé. Exécutez supabase/schema.sql dans le SQL Editor de Supabase.");
  }
  const values = {
    entreprise: draft.entreprise.trim(),
    telephone: normalizeMoroccanPhone(draft.telephone) || null,
    ville: draft.ville.trim() || null,
    status: draft.status,
  };
  if (sectorTableReady) {
    const { data, error } = await supabase.rpc("save_prospect", {
      p_prospect_id: prospectId ?? null,
      p_entreprise: values.entreprise,
      p_telephone: values.telephone,
      p_ville: values.ville,
      p_status: draft.status,
      p_secteur: draft.secteur.trim() || null,
    });
    if (error) throw error;
    if (typeof data !== "string") throw new Error("La base n’a pas retourné l’identifiant du prospect enregistré.");
    return data;
  }
  if (prospectId) {
    let query = supabase.from("prospects").update(values).eq("id", prospectId);
    if (!sharingReady) query = query.eq("user_id", userId);
    const { data, error } = await query.select("id").single();
    if (error) throw error;
    return data.id;
  }

  const { data, error } = await supabase
    .from("prospects")
    .insert({ ...values, user_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateProspectStatus(
  prospectId: string,
  userId: string,
  status: ProspectStatus,
  sharingReady = true,
): Promise<void> {
  if (!supabase) throw new Error("La connexion Supabase n'est pas configurée.");
  let query = supabase.from("prospects").update({ status }).eq("id", prospectId);
  if (!sharingReady) query = query.eq("user_id", userId);
  const { error } = await query;
  if (error) throw error;
}

export async function updateProspectAssignment(prospectId: string, assignedTo: string | null): Promise<void> {
  if (!supabase) throw new Error("La connexion Supabase n'est pas configurée.");
  const { error } = await supabase.rpc("assign_prospect", {
    p_prospect_id: prospectId,
    p_assigned_to: assignedTo,
  });
  if (error) throw error;
}

export async function deleteProspect(prospectId: string, userId: string, sharingReady = true): Promise<void> {
  if (!supabase) throw new Error("La connexion Supabase n'est pas configurée.");
  let query = supabase.from("prospects").delete().eq("id", prospectId);
  if (!sharingReady) query = query.eq("user_id", userId);
  const { error } = await query;
  if (error) throw error;
}

export interface BulkDeleteResult {
  deletedIds: string[];
  failedIds: string[];
  firstError: string;
}

export async function deleteProspects(prospectIds: string[], userId: string, sharingReady = true): Promise<BulkDeleteResult> {
  if (!supabase) throw new Error("La connexion Supabase n'est pas configurée.");
  if (!userId) throw new Error("Reconnectez-vous avant de supprimer des prospects.");

  const ids = [...new Set(prospectIds)];
  const deletedIds: string[] = [];
  const failedIds: string[] = [];
  let firstError = "";
  const batchSize = 100;

  for (let offset = 0; offset < ids.length; offset += batchSize) {
    const batch = ids.slice(offset, offset + batchSize);
    let query = supabase.from("prospects").delete().in("id", batch);
    if (!sharingReady) query = query.eq("user_id", userId);
    const { data, error } = await query.select("id");
    if (error) {
      firstError = error.message;
      failedIds.push(...ids.slice(offset));
      break;
    }

    const batchDeletedIds = (data ?? []).map(row => row.id);
    const deletedInBatch = new Set(batchDeletedIds);
    deletedIds.push(...batchDeletedIds);
    failedIds.push(...batch.filter(id => !deletedInBatch.has(id)));
  }

  return { deletedIds, failedIds, firstError };
}

export async function importProspects(userId: string, drafts: ProspectDraft[], sectorTableReady = true) {
  if (!supabase) throw new Error("La connexion Supabase n'est pas configurée.");
  if (!userId) throw new Error("Reconnectez-vous avant d'importer.");
  if (!sectorTableReady) {
    return { imported: 0, failed: drafts.length, firstError: "Exécutez supabase/schema.sql pour installer la table secteur, les règles RLS et la fonction d’import.", ids: [] as string[] };
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return {
      imported: 0,
      failed: drafts.length,
      firstError: `Précontrôle Supabase impossible : ${authError?.message ?? "aucun utilisateur authentifié"}. Aucune ligne n’a été envoyée.`,
      ids: [],
    };
  }
  if (authData.user.id !== userId) {
    return {
      imported: 0,
      failed: drafts.length,
      firstError: `La session de ${authData.user.email ?? "l’utilisateur connecté"} ne correspond pas au compte CRM actif. Déconnectez-vous puis reconnectez-vous.`,
      ids: [],
    };
  }
  const { data: roleData, error: roleError } = await supabase.rpc("current_crm_role");
  if (roleError) {
    return {
      imported: 0,
      failed: drafts.length,
      firstError: `Précontrôle du rôle Supabase impossible pour ${authData.user.email ?? "le compte connecté"} : ${roleError.message}. Aucune ligne n’a été envoyée.`,
      ids: [],
    };
  }
  const resolvedRole = typeof roleData === "string" ? roleData : "NULL";
  const accountLabel = authData.user.email ?? "email indisponible";
  if (!["admin", "editor", "owner"].includes(resolvedRole)) {
    return {
      imported: 0,
      failed: drafts.length,
      firstError: `Précontrôle Supabase : compte ${accountLabel}, current_crm_role() = ${resolvedRole}. Aucune ligne n’a été envoyée.`,
      ids: [],
    };
  }
  let imported = 0;
  let failed = 0;
  let firstError = "";
  const ids: string[] = [];
  const batchSize = 50;

  for (let offset = 0; offset < drafts.length; offset += batchSize) {
    const batch = drafts.slice(offset, offset + batchSize);
    const { data, error } = await supabase.rpc("import_prospects", {
      prospect_rows: batch,
    });
    if (error) {
      failed += drafts.length - offset;
      firstError = `${error.message} (précontrôle navigateur : ${accountLabel}; current_crm_role() = ${resolvedRole})`;
      break;
    }
    if (Array.isArray(data)) {
      const batchIds = data.filter((id): id is string => typeof id === "string");
      ids.push(...batchIds);
      imported += batchIds.length;
    } else {
      imported += Number(data ?? 0);
    }
  }
  return { imported, failed, firstError, ids };
}
