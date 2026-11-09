import { supabase } from "@/lib/supabase";

export type TeamRole = "viewer" | "editor" | "admin";
export type CrmRole = TeamRole | "owner";

export interface CrmMember {
  email: string;
  role: TeamRole;
  created_at: string;
}

export interface AssignableCrmMember {
  email: string;
  role: TeamRole;
}

export interface CurrentCrmAccess {
  role: CrmRole | null;
  sharingReady: boolean;
}

const ROLE_NAMES: CrmRole[] = ["owner", "viewer", "editor", "admin"];

const KNOWN_MEMBER_NAMES: Record<string, string> = {
  "hindbenmalha06@gmail.com": "Hind",
  "soumia.lahnini95@gmail.com": "Soumia",
  "meryemchahlane@gmail.com": "Meryem",
  "nouhymed@gmail.com": "Nouhy",
};

export function crmMemberName(email: string | null): string {
  if (!email) return "Non assigné";
  const normalized = email.trim().toLocaleLowerCase("en-US");
  const known = KNOWN_MEMBER_NAMES[normalized];
  if (known) return known;
  const localPart = normalized.split("@")[0] ?? normalized;
  const readable = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toLocaleUpperCase("fr-FR") + part.slice(1))
    .join(" ");
  return readable || email;
}

export function crmMemberInitials(email: string | null): string {
  const name = crmMemberName(email);
  if (name === "Non assigné") return "—";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase("fr-FR")).join("");
}

export async function getCurrentCrmAccess(): Promise<CurrentCrmAccess> {
  if (!supabase) throw new Error("La connexion Supabase n'est pas configurée.");
  const { data, error } = await supabase.rpc("current_crm_role");
  if (error) {
    const missingRoleFunction =
      error.code === "PGRST202" ||
      error.code === "42883" ||
      /current_crm_role.*(not found|does not exist|schema cache)|could not find the function/i.test(error.message);
    if (missingRoleFunction) return { role: "owner", sharingReady: false };
    throw error;
  }
  if (data === null) return { role: null, sharingReady: true };
  if (typeof data !== "string" || !ROLE_NAMES.includes(data as CrmRole)) {
    throw new Error("Le rôle Supabase retourné est invalide.");
  }
  return { role: data as CrmRole, sharingReady: true };
}

export async function listCrmMembers(): Promise<CrmMember[]> {
  if (!supabase) throw new Error("La connexion Supabase n'est pas configurée.");
  const { data, error } = await supabase
    .from("crm_members")
    .select("email,role,created_at")
    .order("email", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CrmMember[];
}

export async function listAssignableCrmMembers(): Promise<AssignableCrmMember[]> {
  if (!supabase) throw new Error("La connexion Supabase n'est pas configurée.");
  const { data, error } = await supabase.rpc("list_crm_members_for_assignment");
  if (error) throw error;
  return (data ?? []) as AssignableCrmMember[];
}

export async function saveCrmMember(email: string, role: TeamRole): Promise<void> {
  if (!supabase) throw new Error("La connexion Supabase n'est pas configurée.");
  const normalizedEmail = email.trim().toLocaleLowerCase("en-US");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    throw new Error("Saisissez une adresse email valide.");
  }
  const { error } = await supabase
    .from("crm_members")
    .upsert({ email: normalizedEmail, role }, { onConflict: "email" });
  if (error) throw error;
}

export async function removeCrmMember(email: string): Promise<void> {
  if (!supabase) throw new Error("La connexion Supabase n'est pas configurée.");
  const { error } = await supabase.from("crm_members").delete().eq("email", email.trim().toLocaleLowerCase("en-US"));
  if (error) throw error;
}
