import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, Trash2, UserPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { listCrmMembers, removeCrmMember, saveCrmMember, type CrmMember, type TeamRole } from "@/lib/team";

const ROLE_LABELS: Record<TeamRole, string> = {
  viewer: "Lecture seule",
  editor: "Édition",
  admin: "Administration",
};

export default function TeamManager({ currentEmail }: { currentEmail: string }) {
  const [members, setMembers] = useState<CrmMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("editor");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setMembers(await listCrmMembers());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de charger les membres.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending("add");
    try {
      await saveCrmMember(email, role);
      setEmail("");
      toast.success("Accès d’équipe enregistré.");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Impossible d’ajouter ce compte.");
    } finally {
      setPending("");
    }
  };

  const changeRole = async (member: CrmMember, nextRole: TeamRole) => {
    if (member.email.toLowerCase() === currentEmail.toLowerCase() || nextRole === member.role) return;
    setPending(member.email);
    try {
      await saveCrmMember(member.email, nextRole);
      toast.success(`Rôle mis à jour pour ${member.email}.`);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Impossible de modifier ce rôle.");
    } finally {
      setPending("");
    }
  };

  const revoke = async (member: CrmMember) => {
    if (member.email.toLowerCase() === currentEmail.toLowerCase()) return;
    if (!window.confirm(`Retirer l’accès de ${member.email} à Webora CRM ?`)) return;
    setPending(member.email);
    try {
      await removeCrmMember(member.email);
      toast.success("Accès retiré.");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Impossible de retirer cet accès.");
    } finally {
      setPending("");
    }
  };

  return (
    <section className="team-manager">
      <section className="surface-card team-intro">
        <div className="team-intro-icon"><ShieldCheck size={20} /></div>
        <div>
          <span className="eyebrow">ESPACE PARTAGÉ</span>
          <h2>Les bonnes personnes, au bon niveau.</h2>
          <p>Seules les adresses listées ici peuvent accéder au répertoire partagé. La personne doit se connecter à Supabase avec cette adresse et la confirmer.</p>
        </div>
      </section>

      <section className="surface-card team-panel">
        <div className="team-panel-heading">
          <div><span className="eyebrow">AUTORISATIONS</span><h3>Membres de l’équipe</h3></div>
          <span className="team-count"><UsersRound size={14} />{members.length}</span>
        </div>
        <form className="team-add-form" onSubmit={addMember}>
          <label className="field-label">Adresse email
            <input type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="nom@entreprise.ma" autoComplete="email" />
          </label>
          <label className="field-label">Permission
            <select value={role} onChange={event => setRole(event.target.value as TeamRole)}>
              <option value="viewer">Lecture seule</option>
              <option value="editor">Édition</option>
              <option value="admin">Administration</option>
            </select>
          </label>
          <button className="button button-primary" type="submit" disabled={pending === "add"}><UserPlus size={15} />Ajouter</button>
        </form>

        {error && <p className="inline-error" role="alert">{error}</p>}
        {loading ? <div className="team-loading"><span className="loading-orbit" />Chargement des autorisations…</div> : members.length ? (
          <div className="team-member-list">
            {members.map(member => {
              const isSelf = member.email.toLowerCase() === currentEmail.toLowerCase();
              return (
                <div className="team-member-row" key={member.email}>
                  <div className="team-member-identity"><strong>{member.email}</strong><span>{isSelf ? "Votre compte" : "Compte autorisé"}</span></div>
                  <select aria-label={`Permission pour ${member.email}`} value={member.role} disabled={Boolean(pending) || isSelf} onChange={event => void changeRole(member, event.target.value as TeamRole)}>
                    <option value="viewer">Lecture seule</option>
                    <option value="editor">Édition</option>
                    <option value="admin">Administration</option>
                  </select>
                  <button className="team-remove" type="button" disabled={Boolean(pending) || isSelf} onClick={() => void revoke(member)} aria-label={`Retirer ${member.email}`} title={isSelf ? "Vous ne pouvez pas retirer votre propre accès ici" : "Retirer l’accès"}><Trash2 size={15} /></button>
                </div>
              );
            })}
          </div>
        ) : <p className="team-empty">Aucun membre n’est enregistré.</p>}
      </section>
    </section>
  );
}
