import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPin,
  MoveRight,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  UsersRound,
  KanbanSquare,
} from "lucide-react";
import { toast } from "sonner";
import AssigneeControl from "@/components/crm/AssigneeControl";
import ImportDialog from "@/components/crm/ImportDialog";
import ProspectEditor from "@/components/crm/ProspectEditor";
import SalesScriptDialog from "@/components/crm/SalesScriptDialog";
import TeamManager from "@/components/crm/TeamManager";
import { getCurrentCrmAccess, listAssignableCrmMembers, type AssignableCrmMember, type CrmRole } from "@/lib/team";
import {
  deleteProspect,
  deleteProspects,
  getAllProspects,
  importProspects,
  PROSPECT_STATUSES,
  saveProspect,
  supabase,
  updateProspectAssignment,
  updateProspectStatus,
  type Prospect,
  type ProspectDraft,
  type ProspectStatus,
} from "@/lib/supabase";

type ViewName = "dashboard" | "contacts" | "pipeline" | "team";

const VIEW_LABELS: Record<ViewName, string> = {
  dashboard: "Vue d’ensemble",
  contacts: "Contacts",
  pipeline: "Pipeline",
  team: "Équipe",
};

const STATUS_TONES: Record<ProspectStatus, string> = {
  "À contacter": "tone-slate",
  "Contact initial": "tone-blue",
  "En discussion": "tone-violet",
  "Démo planifiée": "tone-amber",
  "C'est OK": "tone-green",
  "Perdu": "tone-rose",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase("fr-FR")).join("");
}

function displayDate(value: string | null | undefined) {
  if (value == null || value.trim() === "") return "—";
  const date = new Date(value);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0 || date.getUTCFullYear() === 1970) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function StatusPill({ status }: { status: ProspectStatus }) {
  return <span className={`status-pill ${STATUS_TONES[status]}`}><i />{status}</span>;
}

async function notifyNewProspects(session: Session, prospectIds: string[]): Promise<void> {
  const ids = [...new Set(prospectIds)];
  for (let offset = 0; offset < ids.length; offset += 5000) {
    const response = await fetch("/api/notifications/new-prospects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ prospectIds: ids.slice(offset, offset + 5000) }),
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) throw new Error(result?.error || "L’alerte email n’a pas pu être envoyée.");
  }
}

function AuthScreen() {
  const [createAccount, setCreateAccount] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (createAccount) {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: new URL("/", window.location.origin).toString() },
        });
        if (authError) throw authError;
        if (!data.session) setNotice("Vérifiez votre boîte mail et confirmez l’adresse. Le lien vous ramènera automatiquement vers Webora.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connexion impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <BrandMark large />
        <span className="eyebrow">VOTRE ESPACE DE PROSPECTION</span>
        <h1>{createAccount ? "Créez votre espace." : "Reprenez le fil."}</h1>
        <p className="auth-copy">Vos prochaines conversations, au même endroit.</p>
        <form className="auth-form" onSubmit={submit}>
          <label className="field-label">Adresse e-mail
            <input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="vous@entreprise.ma" />
          </label>
          <label className="field-label">Mot de passe
            <input type="password" autoComplete={createAccount ? "new-password" : "current-password"} minLength={6} required value={password} onChange={event => setPassword(event.target.value)} placeholder="6 caractères minimum" />
          </label>
          {error && <p className="inline-error" role="alert">{error}</p>}
          {notice && <p className="inline-success" role="status">{notice}</p>}
          <button className="button button-primary auth-submit" disabled={busy} type="submit">{busy ? "Un instant…" : createAccount ? "Créer mon compte" : "Se connecter"}<MoveRight size={16} /></button>
        </form>
        <p className="auth-switch">{createAccount ? "Vous avez déjà un compte ?" : "Nouveau sur Webora ?"}{" "}<button type="button" onClick={() => { setCreateAccount(!createAccount); setError(""); setNotice(""); }}>{createAccount ? "Se connecter" : "Créer un compte"}</button></p>
        <p className="auth-security">Authentification Supabase · vos prospects restent privés.</p>
      </section>
    </main>
  );
}

function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <div className={`brand-lockup${large ? " brand-large" : ""}`}>
      <img className="brand-logo" src="/manus-storage/webora-logo_704fc956.png" alt="Webora" width={1200} height={942} />
    </div>
  );
}

function SetupScreen() {
  return (
    <main className="setup-screen">
      <section className="setup-card">
        <BrandMark large />
        <span className="eyebrow">CONFIGURATION NÉCESSAIRE</span>
        <h1>Reliez votre espace Supabase.</h1>
        <p>Ajoutez l’URL de votre projet et sa clé publique anon dans les paramètres du projet. Webora n’utilise aucune donnée de démonstration.</p>
        <div className="setup-steps"><span>01</span><p>Configurez <strong>SUPABASE_URL</strong> et <strong>SUPABASE_ANON_KEY</strong>.</p><span>02</span><p>Exécutez <code>supabase/schema.sql</code> dans le SQL Editor de Supabase pour créer la table et activer RLS.</p></div>
      </section>
    </main>
  );
}

function LoadingScreen() {
  return <main className="loading-screen"><span className="loading-orbit" /><span>Préparation de votre espace…</span></main>;
}

function AppError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const looksLikeMissingSchema = /prospects|prospect_secteurs|relation|schema cache|does not exist/i.test(message);
  return (
    <div className="connection-notice" role="alert">
      <div><strong>{looksLikeMissingSchema ? "La base Supabase n’est pas encore prête." : "Impossible de charger les prospects."}</strong><p>{looksLikeMissingSchema ? "Exécutez le script supabase/schema.sql dans le SQL Editor de votre projet Supabase, puis réessayez." : message}</p></div>
      <button className="button button-quiet" type="button" onClick={onRetry}>Réessayer</button>
    </div>
  );
}

function Dashboard({ prospects, onOpenContacts, onOpenPipeline }: {
  prospects: Prospect[];
  onOpenContacts: () => void;
  onOpenPipeline: () => void;
}) {
  const statusCounts = useMemo(() => PROSPECT_STATUSES.map(status => ({
    status,
    count: prospects.filter(prospect => prospect.status === status).length,
  })), [prospects]);
  const activeCount = prospects.filter(prospect => prospect.status !== "Perdu" && prospect.status !== "C'est OK").length;
  const wonCount = prospects.filter(prospect => prospect.status === "C'est OK").length;
  const progress = prospects.length ? Math.round((wonCount / prospects.length) * 100) : 0;
  const recent = prospects.slice(0, 5);

  return (
    <div className="dashboard-content">
      <section className="welcome-panel">
        <div><span className="eyebrow">VOTRE ACTIVITÉ</span><h2>Vos prochaines conversations,<br /><em>au même endroit.</em></h2><p>Un aperçu clair de votre prospection, construit à partir de vos contacts.</p></div>
        <div className="welcome-mark" aria-hidden="true"><span /><span /><span /></div>
      </section>
      <section className="metric-grid" aria-label="Statistiques des prospects">
        <article className="metric-card metric-main"><span className="metric-label">Total prospects</span><strong className="metric-value">{prospects.length.toLocaleString("fr-FR")}</strong><span className="metric-foot"><Users size={14} /> Contacts dans votre espace</span><div className="metric-corner"><ArrowUpRight size={18} /></div></article>
        <article className="metric-card"><span className="metric-label">En cours</span><strong className="metric-value">{activeCount.toLocaleString("fr-FR")}</strong><span className="metric-foot">Dans votre pipeline actif</span><div className="metric-line"><i style={{ width: `${prospects.length ? Math.round(activeCount / prospects.length * 100) : 0}%` }} /></div></article>
        <article className="metric-card"><span className="metric-label">Convertis</span><strong className="metric-value">{wonCount.toLocaleString("fr-FR")}</strong><span className="metric-foot">{progress}% de vos prospects</span><div className="metric-line metric-line-green"><i style={{ width: `${progress}%` }} /></div></article>
      </section>
      <section className="dashboard-lower">
        <article className="surface-card pipeline-summary">
          <div className="section-heading"><div><span className="eyebrow">MOUVEMENT</span><h3>Votre pipeline</h3></div><button className="text-link" type="button" onClick={onOpenPipeline}>Voir le pipeline <ArrowUpRight size={14} /></button></div>
          <div className="status-breakdown">{statusCounts.map(({ status, count }) => <div className="breakdown-row" key={status}><span className={`breakdown-dot ${STATUS_TONES[status]}`} /><span className="breakdown-label">{status}</span><div className="breakdown-track"><i className={STATUS_TONES[status]} style={{ width: `${prospects.length ? Math.max(count ? 3 : 0, count / prospects.length * 100) : 0}%` }} /></div><strong>{count}</strong></div>)}</div>
        </article>
        <article className="surface-card recent-card">
          <div className="section-heading"><div><span className="eyebrow">DERNIÈRES FICHES</span><h3>Ajouts récents</h3></div><button className="circle-link" type="button" onClick={onOpenContacts} aria-label="Voir tous les contacts"><ArrowUpRight size={16} /></button></div>
          {recent.length ? <div className="recent-list">{recent.map(prospect => <div className="recent-item" key={prospect.id}><span className="company-avatar">{initials(prospect.entreprise)}</span><div className="recent-name"><strong>{prospect.entreprise}</strong><span>{prospect.ville || prospect.secteur || "—"}</span></div><StatusPill status={prospect.status} /></div>)}</div> : <EmptyState icon={<Users size={20} />} title="Votre espace commence ici" text="Ajoutez votre premier prospect pour voir son avancement." action={onOpenContacts} actionLabel="Ouvrir les contacts" compact />}
        </article>
      </section>
    </div>
  );
}

function EmptyState({ icon, title, text, action, actionLabel, compact = false }: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: () => void;
  actionLabel?: string;
  compact?: boolean;
}) {
  return <div className={`empty-state${compact ? " empty-compact" : ""}`}><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p>{action && <button className="button button-quiet" type="button" onClick={action}>{actionLabel}</button>}</div>;
}

function Contacts({
  prospects,
  currentEmail,
  assignmentReady,
  members,
  canAssign,
  onAssign,
  onCreate,
  onEdit,
  onOpenSalesScript,
  onDelete,
  onDeleteSelected,
  onImport,
  canEdit,
  canDelete,
}: {
  prospects: Prospect[];
  currentEmail: string;
  assignmentReady: boolean;
  members: AssignableCrmMember[];
  canAssign: boolean;
  onAssign: (prospectId: string, email: string | null) => Promise<void>;
  onCreate: () => void;
  onEdit: (prospect: Prospect) => void;
  onOpenSalesScript: (prospect: Prospect) => void;
  onDelete: (prospect: Prospect) => void;
  onDeleteSelected: (prospectIds: string[]) => Promise<string[]>;
  onImport: () => void;
  canEdit: boolean;
  canDelete: (prospect: Prospect) => boolean;
}) {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [sector, setSector] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<"mine" | "all">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const cities = useMemo(() => [...new Set(prospects.map(item => item.ville.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [prospects]);
  const sectors = useMemo(() => [...new Set(prospects.map(item => item.secteur.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [prospects]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr-FR");
    return prospects.filter(item => {
      const matchesQuery = !needle || [item.entreprise, item.telephone, item.ville, item.secteur].some(value => value.toLocaleLowerCase("fr-FR").includes(needle));
      const matchesOwner = ownerFilter === "all" || (!!currentEmail && item.assigned_to?.toLocaleLowerCase("en-US") === currentEmail.toLocaleLowerCase("en-US"));
      return matchesQuery && (!city || item.ville === city) && (!sector || item.secteur === sector) && matchesOwner;
    });
  }, [prospects, query, city, sector, ownerFilter, currentEmail]);

  const selectableFiltered = filtered.filter(canDelete);
  const allFilteredSelected = selectableFiltered.length > 0 && selectableFiltered.every(prospect => selectedIds.has(prospect.id));
  const someFilteredSelected = selectableFiltered.some(prospect => selectedIds.has(prospect.id));
  const selectedDeletable = useMemo(
    () => prospects.filter(prospect => selectedIds.has(prospect.id) && canDelete(prospect)),
    [prospects, selectedIds, canDelete],
  );

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someFilteredSelected && !allFilteredSelected;
  }, [allFilteredSelected, someFilteredSelected]);

  useEffect(() => {
    const existingIds = new Set(prospects.map(prospect => prospect.id));
    setSelectedIds(current => {
      const next = new Set([...current].filter(id => existingIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [prospects]);

  const toggleSelectAll = () => setSelectedIds(current => {
    const next = new Set(current);
    if (allFilteredSelected) selectableFiltered.forEach(prospect => next.delete(prospect.id));
    else selectableFiltered.forEach(prospect => next.add(prospect.id));
    return next;
  });

  const toggleContactSelection = (prospectId: string, checked: boolean) => setSelectedIds(current => {
    const next = new Set(current);
    if (checked) next.add(prospectId);
    else next.delete(prospectId);
    return next;
  });

  const handleBulkDelete = async () => {
    if (bulkDeleting || !selectedDeletable.length) return;
    setBulkDeleting(true);
    try {
      const deletedIds = await onDeleteSelected(selectedDeletable.map(prospect => prospect.id));
      if (deletedIds.length) {
        const deleted = new Set(deletedIds);
        setSelectedIds(current => new Set([...current].filter(id => !deleted.has(id))));
      }
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="contacts-content">
      <section className="contacts-toolbar">
        <div className="toolbar-search"><Search size={17} /><input aria-label="Rechercher les contacts" placeholder="Rechercher une entreprise, ville…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" onClick={() => setQuery("")}>Effacer</button>}</div>
        {assignmentReady && currentEmail && <div className="assignment-quick-filter" role="group" aria-label="Filtrer les prospects par responsable"><button className={ownerFilter === "mine" ? "filter-active" : ""} type="button" aria-pressed={ownerFilter === "mine"} onClick={() => setOwnerFilter("mine")}>Mes prospects</button><button className={ownerFilter === "all" ? "filter-active" : ""} type="button" aria-pressed={ownerFilter === "all"} onClick={() => setOwnerFilter("all")}>Tous les prospects</button></div>}
        <div className="toolbar-filters">
          <label className="select-filter"><MapPin size={15} /><select aria-label="Filtrer par ville" value={city} onChange={event => setCity(event.target.value)}><option value="">Toutes les villes</option>{cities.map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label>
          <label className="select-filter"><Building2 size={15} /><select aria-label="Filtrer par secteur" value={sector} onChange={event => setSector(event.target.value)}><option value="">Tous les secteurs</option>{sectors.map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label>
        </div>
      </section>
      <section className="surface-card contacts-table-card">
        <div className="table-heading"><div><h3>Répertoire</h3><span>{filtered.length} contact{filtered.length === 1 ? "" : "s"}{filtered.length !== prospects.length ? ` sur ${prospects.length}` : ""}</span></div>{canEdit && <div className="table-actions"><button className="button button-quiet button-small" type="button" onClick={onImport}><Upload size={15} /> Importer</button><button className="button button-primary button-small" type="button" onClick={onCreate}><Plus size={15} /> Ajouter</button></div>}</div>
        {(selectableFiltered.length > 0 || selectedDeletable.length > 0) && <div className="bulk-selection-bar">
          <div className="bulk-selection-info">
            {selectableFiltered.length > 0 && <label className="bulk-select-all"><input ref={selectAllRef} className="selection-checkbox" type="checkbox" checked={allFilteredSelected} disabled={bulkDeleting} onChange={toggleSelectAll} aria-label={`Tout sélectionner parmi les ${selectableFiltered.length} contacts filtrés`} /><span>Tout sélectionner</span><small>{selectableFiltered.length.toLocaleString("fr-FR")} résultat{selectableFiltered.length === 1 ? "" : "s"}</small></label>}
            {selectedDeletable.length > 0 && <span className="bulk-selection-count">{selectedDeletable.length.toLocaleString("fr-FR")} sélectionné{selectedDeletable.length === 1 ? "" : "s"}</span>}
          </div>
          {selectedDeletable.length > 0 && <div className="bulk-selection-actions"><button className="button button-quiet button-small bulk-delete-button" type="button" onClick={handleBulkDelete} disabled={bulkDeleting}><Trash2 size={14} />{bulkDeleting ? "Suppression…" : `Supprimer (${selectedDeletable.length.toLocaleString("fr-FR")})`}</button><button className="button button-quiet button-small" type="button" onClick={() => setSelectedIds(new Set())} disabled={bulkDeleting}>Effacer la sélection</button></div>}
        </div>}
        {filtered.length ? (
          <>
            <div className="table-scroll">
              <table className="contacts-table">
                <thead><tr><th className="selection-cell"><span className="visually-hidden">Sélection</span></th><th>ENTREPRISE</th><th>VILLE / SECTEUR</th><th>TÉLÉPHONE</th><th>ÉTAPE</th><th>RESPONSABLE</th><th>CRÉÉ LE</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
                <tbody>{filtered.map(prospect => (
                  <tr key={prospect.id}>
                    <td className="selection-cell">{canDelete(prospect) && <input className="selection-checkbox" type="checkbox" checked={selectedIds.has(prospect.id)} disabled={bulkDeleting} onChange={event => toggleContactSelection(prospect.id, event.target.checked)} aria-label={`Sélectionner ${prospect.entreprise}`} />}</td>
                    <td><div className="company-cell"><span className="company-avatar">{initials(prospect.entreprise)}</span><strong>{prospect.entreprise}</strong></div></td>
                    <td><div className="location-cell"><span>{prospect.ville || "—"}</span><small>{prospect.secteur || "Secteur non renseigné"}</small></div></td>
                    <td className="phone-cell">{prospect.telephone || "—"}</td>
                    <td><StatusPill status={prospect.status} /></td>
                    <td>{assignmentReady && <AssigneeControl prospectId={prospect.id} prospectName={prospect.entreprise} assignedTo={prospect.assigned_to} members={members} canAssign={canAssign} assignmentReady={assignmentReady} onAssign={onAssign} />}</td>
                    <td className="date-cell">{displayDate(prospect.created_at)}</td>
                    <td><div className="row-actions"><button className="row-action sales-script-action" type="button" onClick={() => onOpenSalesScript(prospect)} aria-label={`Ouvrir le script de vente pour ${prospect.entreprise}`}><FileText size={13} />Script</button>{canEdit && <button className="row-action" type="button" onClick={() => onEdit(prospect)} aria-label={`Modifier ${prospect.entreprise}`}>Modifier</button>}{canDelete(prospect) && <button className="row-delete" type="button" onClick={() => onDelete(prospect)} aria-label={`Supprimer ${prospect.entreprise}`}><Trash2 size={15} /></button>}</div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="contacts-mobile-list" role="list">
              {filtered.map(prospect => (
                <article className="contact-mobile-card" key={prospect.id} role="listitem">
                  <div className="contact-mobile-head">
                    <div className="contact-mobile-company">{canDelete(prospect) && <input className="selection-checkbox" type="checkbox" checked={selectedIds.has(prospect.id)} disabled={bulkDeleting} onChange={event => toggleContactSelection(prospect.id, event.target.checked)} aria-label={`Sélectionner ${prospect.entreprise}`} />}<span className="company-avatar">{initials(prospect.entreprise)}</span><div><strong>{prospect.entreprise}</strong><span>{prospect.ville || "Ville non renseignée"}</span></div></div>
                    <StatusPill status={prospect.status} />
                  </div>
                  <div className="contact-mobile-details">
                    <div className="contact-mobile-field"><span>Secteur</span><strong>{prospect.secteur || "Non renseigné"}</strong></div>
                    <div className="contact-mobile-field"><span>Téléphone</span>{prospect.telephone ? <a href={`tel:${prospect.telephone.replace(/[^\d+]/g, "")}`}>{prospect.telephone}</a> : <strong>—</strong>}</div>
                    {assignmentReady && <div className="contact-mobile-field contact-mobile-assignee"><span>Responsable</span><AssigneeControl prospectId={prospect.id} prospectName={prospect.entreprise} assignedTo={prospect.assigned_to} members={members} canAssign={canAssign} assignmentReady={assignmentReady} onAssign={onAssign} /></div>}
                    <div className="contact-mobile-field"><span>Créé le</span><strong>{displayDate(prospect.created_at)}</strong></div>
                  </div>
                  <div className="contact-mobile-actions">
                    <button className="row-action sales-script-action" type="button" onClick={() => onOpenSalesScript(prospect)} aria-label={`Ouvrir le script de vente pour ${prospect.entreprise}`}><FileText size={14} />Script de vente</button>
                    {canEdit && <button className="row-action" type="button" onClick={() => onEdit(prospect)} aria-label={`Modifier ${prospect.entreprise}`}>Modifier</button>}
                    {canDelete(prospect) && <button className="row-delete" type="button" onClick={() => onDelete(prospect)} aria-label={`Supprimer ${prospect.entreprise}`}><Trash2 size={16} /></button>}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <EmptyState icon={<Users size={20} />} title={prospects.length ? "Aucun résultat" : "Aucun contact pour l’instant"} text={prospects.length ? "Modifiez votre recherche ou vos filtres." : "Importez un fichier ou ajoutez votre premier prospect."} action={prospects.length || !canEdit ? undefined : onCreate} actionLabel="Ajouter un prospect" />
        )}
      </section>
    </div>
  );
}

function Pipeline({ prospects, onStatusChange, onEdit, onOpenSalesScript, canEdit, members, assignmentReady, onAssign }: {
  prospects: Prospect[];
  onStatusChange: (prospect: Prospect, status: ProspectStatus) => void;
  onEdit: (prospect: Prospect) => void;
  onOpenSalesScript: (prospect: Prospect) => void;
  canEdit: boolean;
  members: AssignableCrmMember[];
  assignmentReady: boolean;
  onAssign: (prospectId: string, email: string | null) => Promise<void>;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  return (
    <div className="kanban-scroll">
      <div className="kanban-board">
        {PROSPECT_STATUSES.map((status, index) => {
          const cards = prospects.filter(item => item.status === status);
          return (
            <section
              className={`kanban-column ${draggingId ? "kanban-ready" : ""}`}
              key={status}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                const draggedId = event.dataTransfer.getData("text/plain") || draggingId;
                const item = prospects.find(prospect => prospect.id === draggedId);
                if (item && item.status !== status) onStatusChange(item, status);
                setDraggingId(null);
              }}
            >
              <header className="kanban-column-heading">
                <span className={`stage-index ${STATUS_TONES[status]}`}>{String(index + 1).padStart(2, "0")}</span>
                <h3>{status}</h3>
                <span className="stage-count">{cards.length}</span>
              </header>
              <div className="kanban-cards" aria-label={`Prospects — ${status}`}>
                {cards.map(prospect => (
                  <article
                    className={`kanban-card${draggingId === prospect.id ? " is-dragging" : ""}`}
                    key={prospect.id}
                    draggable={canEdit}
                    onClick={event => {
                      if (!canEdit || (event.target as HTMLElement).closest("button")) return;
                      onEdit(prospect);
                    }}
                    onDragStart={canEdit ? event => {
                      setDraggingId(prospect.id);
                      event.dataTransfer.setData("text/plain", prospect.id);
                      event.dataTransfer.effectAllowed = "move";
                    } : undefined}
                    onDragEnd={() => setDraggingId(null)}
                  >
                    <button
                      className="kanban-card-open"
                      type="button"
                      disabled={!canEdit}
                      onClick={() => onEdit(prospect)}
                      aria-label={`Ouvrir la fiche de ${prospect.entreprise} pour modifier son statut`}
                      title="Ouvrir la fiche du prospect"
                    >
                      <strong className="kanban-card-company">{prospect.entreprise}</strong>
                      <span className="kanban-meta">{prospect.ville || "Ville non renseignée"}</span>
                    </button>
                    <AssigneeControl
                      prospectId={prospect.id}
                      prospectName={prospect.entreprise}
                      assignedTo={prospect.assigned_to}
                      members={members}
                      canAssign={false}
                      assignmentReady={assignmentReady}
                      onAssign={onAssign}
                    />
                    <button
                      className="kanban-script-button"
                      type="button"
                      draggable={false}
                      onDragStart={event => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={() => onOpenSalesScript(prospect)}
                      aria-label={`Ouvrir le script de vente pour ${prospect.entreprise}`}
                      title="Script de vente"
                    >
                      <FileText size={14} aria-hidden="true" />
                    </button>
                  </article>
                ))}
              </div>
              {!cards.length && <div className="kanban-empty">Déposez un prospect ici</div>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function AccessBlockedScreen({ email, title, message, onSignOut }: {
  email: string;
  title: string;
  message: string;
  onSignOut: () => void;
}) {
  return (
    <main className="auth-screen">
      <section className="auth-card access-blocked-card">
        <BrandMark large />
        <div className="team-intro-icon"><ShieldCheck size={20} /></div>
        <span className="eyebrow">ESPACE PRIVÉ WEBORA</span>
        <h1>{title}</h1>
        {email && <p className="access-account">{email}</p>}
        <p className="auth-copy">{message}</p>
        <button className="button button-quiet" type="button" onClick={onSignOut}><LogOut size={15} />Se déconnecter</button>
      </section>
    </main>
  );
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const [crmRole, setCrmRole] = useState<CrmRole | null>(null);
  const [teamSharingReady, setTeamSharingReady] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [dataLoading, setDataLoading] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [sectorTableReady, setSectorTableReady] = useState(false);
  const [assignmentTableReady, setAssignmentTableReady] = useState(false);
  const [assignableMembers, setAssignableMembers] = useState<AssignableCrmMember[]>([]);
  const [assignmentMembersError, setAssignmentMembersError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [view, setView] = useState<ViewName>("dashboard");
  const [editing, setEditing] = useState<Prospect | null | "new">(null);
  const [salesScriptProspect, setSalesScriptProspect] = useState<Prospect | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const canEdit = crmRole === "admin" || crmRole === "editor" || crmRole === "owner";
  const canAssign = crmRole === "admin" || crmRole === "editor";
  const isAdmin = crmRole === "admin";
  const canDeleteProspect = (prospect: Prospect) => isAdmin || (crmRole === "owner" && session?.user.id === prospect.user_id);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setAuthLoading(false);
      }
    }).catch(() => { if (active) setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session?.user.id) {
      setCrmRole(null);
      setTeamSharingReady(false);
      setRoleError("");
      setRoleLoading(false);
      return;
    }
    let active = true;
    setRoleLoading(true);
    setRoleError("");
    getCurrentCrmAccess().then(access => {
      if (!active) return;
      setCrmRole(access.role);
      setTeamSharingReady(access.sharingReady);
    }).catch(cause => {
      if (!active) return;
      setCrmRole(null);
      setRoleError(cause instanceof Error ? cause.message : "Les autorisations n’ont pas pu être vérifiées.");
    }).finally(() => { if (active) setRoleLoading(false); });
    return () => { active = false; };
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user.id || roleLoading || !crmRole) {
      setProspects([]);
      setSectorTableReady(false);
      setAssignmentTableReady(false);
      setLoadError("");
      setDataLoading(false);
      return;
    }
    let active = true;
    setDataLoading(true);
    setLoadError("");
    getAllProspects(session.user.id, teamSharingReady).then(data => {
      if (active) {
        setProspects(data.prospects);
        setSectorTableReady(data.sectorTableReady);
        setAssignmentTableReady(data.assignmentReady);
      }
    }).catch(error => {
      if (active) setLoadError(error instanceof Error ? error.message : "Erreur lors du chargement des données.");
    }).finally(() => { if (active) setDataLoading(false); });
    return () => { active = false; };
  }, [session?.user.id, refresh, crmRole, roleLoading, teamSharingReady]);

  useEffect(() => {
    if (!session?.user.id || !assignmentTableReady || !canAssign) {
      setAssignableMembers([]);
      setAssignmentMembersError("");
      return;
    }
    let active = true;
    setAssignmentMembersError("");
    listAssignableCrmMembers().then(members => {
      if (active) setAssignableMembers(members);
    }).catch(error => {
      if (active) {
        setAssignableMembers([]);
        setAssignmentMembersError(error instanceof Error ? error.message : "Impossible de charger les membres assignables.");
      }
    });
    return () => { active = false; };
  }, [session?.user.id, assignmentTableReady, canAssign]);

  const refreshData = () => setRefresh(value => value + 1);

  const handleSave = async (draft: ProspectDraft, id?: string) => {
    if (!session) throw new Error("Votre session a expiré. Reconnectez-vous.");
    if (!canEdit) throw new Error("Votre rôle ne permet pas de modifier les prospects.");
    const savedId = await saveProspect(session.user.id, draft, id, sectorTableReady, teamSharingReady);
    toast.success(id ? "Prospect mis à jour." : "Prospect ajouté.");
    if (!id) {
      try {
        await notifyNewProspects(session, [savedId]);
      } catch (error) {
        toast.error(`Prospect enregistré, mais notification email non envoyée : ${error instanceof Error ? error.message : "erreur inconnue"}`);
      }
    }
    refreshData();
  };

  const handleDelete = async (prospect: Prospect) => {
    if (!session || !canDeleteProspect(prospect) || !window.confirm(`Supprimer définitivement ${prospect.entreprise} ?`)) return;
    try {
      await deleteProspect(prospect.id, session.user.id, teamSharingReady);
      toast.success("Prospect supprimé.");
      refreshData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible.");
    }
  };

  const handleBulkDelete = async (prospectIds: string[]): Promise<string[]> => {
    if (!session || !prospectIds.length) return [];
    const requested = new Set(prospectIds);
    const permittedIds = prospects
      .filter(prospect => requested.has(prospect.id) && canDeleteProspect(prospect))
      .map(prospect => prospect.id);
    if (!permittedIds.length) {
      toast.error("Aucun contact sélectionné ne peut être supprimé par ce compte.");
      return [];
    }

    const count = permittedIds.length;
    const countLabel = `${count.toLocaleString("fr-FR")} contact${count === 1 ? "" : "s"}`;
    const confirmed = window.confirm(`Supprimer définitivement les ${countLabel} sélectionnés ?\n\nLes secteurs associés seront également supprimés. Cette action est irréversible.`);
    if (!confirmed) return [];

    try {
      const result = await deleteProspects(permittedIds, session.user.id, teamSharingReady);
      if (result.deletedIds.length) refreshData();
      if (result.failedIds.length) {
        const reason = result.firstError || "Certains contacts ne sont plus disponibles ou ne peuvent pas être supprimés.";
        toast.error(`${result.deletedIds.length} supprimé${result.deletedIds.length === 1 ? "" : "s"}, ${result.failedIds.length} non supprimé${result.failedIds.length === 1 ? "" : "s"}. ${reason}`);
      } else {
        toast.success(`${result.deletedIds.length.toLocaleString("fr-FR")} contact${result.deletedIds.length === 1 ? "" : "s"} supprimé${result.deletedIds.length === 1 ? "" : "s"}.`);
      }
      return result.deletedIds;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression groupée impossible.");
      return [];
    }
  };

  const handleStatusChange = async (prospect: Prospect, status: ProspectStatus) => {
    if (!session || !canEdit || status === prospect.status) return;
    try {
      await updateProspectStatus(prospect.id, session.user.id, status, teamSharingReady);
      setProspects(current => current.map(item => item.id === prospect.id ? { ...item, status } : item));
      toast.success(`Étape mise à jour : ${status}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de modifier l’étape.");
    }
  };

  const handleAssign = async (prospectId: string, email: string | null) => {
    if (!session || !canAssign) {
      toast.error("Votre rôle ne permet pas de changer le responsable.");
      return;
    }
    try {
      await updateProspectAssignment(prospectId, email);
      setProspects(current => current.map(item => item.id === prospectId ? { ...item, assigned_to: email } : item));
      toast.success(email ? "Responsable mis à jour." : "Prospect retiré des responsables.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de modifier le responsable.");
    }
  };

  const handleImport = async (rows: ProspectDraft[]) => {
    if (!session || !canEdit) throw new Error("Votre rôle ne permet pas d’importer des prospects.");
    const result = await importProspects(session.user.id, rows, sectorTableReady);
    refreshData();
    if (result.ids.length) {
      try {
        await notifyNewProspects(session, result.ids);
      } catch (error) {
        toast.error(`Import enregistré, mais notification email non envoyée : ${error instanceof Error ? error.message : "erreur inconnue"}`);
      }
    }
    if (result.failed) toast.error(`${result.failed} ligne${result.failed > 1 ? "s" : ""} non importée${result.failed > 1 ? "s" : ""}. ${result.firstError}`);
    if (result.imported === 0 && rows.length) throw new Error(result.firstError || "Aucune ligne n’a pu être enregistrée. Vérifiez le schéma Supabase et les politiques RLS.");
    return result.imported;
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
    else setView("dashboard");
  };

  if (!supabase) return <SetupScreen />;
  if (authLoading) return <LoadingScreen />;
  if (!session) return <AuthScreen />;
  if (roleLoading) return <LoadingScreen />;
  if (roleError) return <AccessBlockedScreen email={session.user.email ?? ""} title="Vérification impossible" message="Les autorisations n’ont pas pu être vérifiées. Vérifiez la configuration RLS Supabase." onSignOut={signOut} />;
  if (!crmRole) return <AccessBlockedScreen email={session.user.email ?? ""} title="Accès restreint" message="Cette adresse n’est pas autorisée à consulter l’espace partagé. Demandez à un administrateur de l’ajouter dans Équipe." onSignOut={signOut} />;

  const activeTitle = VIEW_LABELS[view];
  const displayName = session.user.email?.split("@")[0] ?? "votre espace";
  const currentEmail = session.user.email ?? "";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <BrandMark />
        <div className="workspace-label">ESPACE DE TRAVAIL</div>
        <nav className="side-nav" aria-label="Navigation principale">
          <button className={`nav-item${view === "dashboard" ? " nav-active" : ""}`} onClick={() => setView("dashboard")} type="button"><LayoutDashboard size={17} />Vue d’ensemble</button>
          <button className={`nav-item${view === "contacts" ? " nav-active" : ""}`} onClick={() => setView("contacts")} type="button"><Users size={17} />Contacts<span className="nav-count">{prospects.length}</span></button>
          <button className={`nav-item${view === "pipeline" ? " nav-active" : ""}`} onClick={() => setView("pipeline")} type="button"><KanbanSquare size={17} />Pipeline</button>
          {isAdmin && teamSharingReady && <button className={`nav-item${view === "team" ? " nav-active" : ""}`} onClick={() => setView("team")} type="button"><UsersRound size={17} />Équipe</button>}
        </nav>
        <button className="mobile-signout" type="button" onClick={signOut} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={15} /><span>Déconnexion</span></button>
        <div className="sidebar-bottom"><div className="workspace-stamp"><span className="workspace-avatar">{initials(displayName) || "P"}</span><span><strong>{displayName}</strong><small>Compte Supabase</small></span><button type="button" onClick={signOut} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={15} /></button></div><p className="privacy-note"><span />Session authentifiée Supabase</p></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="breadcrumb"><span>Webora</span><MoveRight size={14} /><strong>{activeTitle}</strong></div><div className="topbar-actions">{canEdit && <button className="button button-quiet button-small import-top" type="button" onClick={() => setImportOpen(true)}><Upload size={15} />Importer</button>}{canEdit && <button className="button button-primary button-small" type="button" onClick={() => setEditing("new")}><Plus size={16} />Nouveau prospect</button>}</div></header>
        <div className="page-content"><div className="page-title-row"><div><span className="eyebrow">WEBORA <span className="title-separator">/</span> {activeTitle.toLocaleUpperCase("fr-FR")}</span><h1>{view === "dashboard" ? "Bonjour, " : ""}<em>{view === "dashboard" ? `${displayName}.` : activeTitle}</em></h1><p>{view === "dashboard" ? "Voici où en sont vos conversations commerciales." : view === "contacts" ? "Retrouvez et organisez toutes vos relations commerciales." : view === "pipeline" ? "Faites avancer vos opportunités, étape par étape." : "Gérez les adresses et les permissions de votre espace partagé."}</p></div>{view !== "dashboard" && view !== "team" && <div className="title-count"><strong>{prospects.length.toLocaleString("fr-FR")}</strong><span>prospects</span></div>}</div>
          {loadError && <AppError message={loadError} onRetry={refreshData} />}
          {!dataLoading && !loadError && !teamSharingReady && <div className="connection-notice" role="status"><div><strong>Le partage multi-comptes n’est pas encore activé.</strong><p>Le CRM reste limité aux fiches de votre compte. Exécutez <code>supabase/schema.sql</code> dans le SQL Editor Supabase pour activer les rôles, les membres autorisés et le partage RLS.</p></div></div>}
          {!dataLoading && !loadError && !sectorTableReady && <div className="connection-notice" role="status"><div><strong>Le stockage du secteur reste à préparer.</strong><p>Exécutez <code>supabase/schema.sql</code> dans le SQL Editor Supabase pour ajouter la table des secteurs, les règles RLS et l’import CSV/Excel complet.</p></div></div>}
          {!dataLoading && !loadError && teamSharingReady && !assignmentTableReady && (view === "contacts" || view === "pipeline") && <div className="connection-notice" role="status"><div><strong>L’attribution des prospects n’est pas encore activée.</strong><p>Exécutez <code>supabase/add-prospect-assignment.sql</code> dans le SQL Editor Supabase pour ajouter le responsable et ses permissions.</p></div></div>}
          {!dataLoading && !loadError && teamSharingReady && assignmentTableReady && canAssign && assignmentMembersError && (view === "contacts" || view === "pipeline") && <div className="connection-notice" role="status"><div><strong>La liste des membres assignables n’a pas pu être chargée.</strong><p>{assignmentMembersError}</p></div></div>}
          {dataLoading && <div className="data-loading"><span className="loading-orbit" />Synchronisation de vos prospects…</div>}
          {view === "dashboard" && <Dashboard prospects={prospects} onOpenContacts={() => setView("contacts")} onOpenPipeline={() => setView("pipeline")} />}
          {view === "contacts" && <Contacts prospects={prospects} currentEmail={currentEmail} assignmentReady={assignmentTableReady} members={assignableMembers} canAssign={canAssign} onAssign={handleAssign} onCreate={() => setEditing("new")} onEdit={prospect => setEditing(prospect)} onOpenSalesScript={setSalesScriptProspect} onDelete={handleDelete} onDeleteSelected={handleBulkDelete} onImport={() => setImportOpen(true)} canEdit={canEdit} canDelete={canDeleteProspect} />}
          {view === "pipeline" && <Pipeline prospects={prospects} onStatusChange={handleStatusChange} onEdit={prospect => setEditing(prospect)} onOpenSalesScript={setSalesScriptProspect} canEdit={canEdit} members={assignableMembers} assignmentReady={assignmentTableReady} onAssign={handleAssign} />}
          {view === "team" && isAdmin && teamSharingReady && <TeamManager currentEmail={session.user.email ?? ""} />}
          <footer className="page-footer"><span>Webora CRM</span><span><span className="footer-live-dot" />Connecté à Supabase</span></footer>
        </div>
      </main>
      {editing !== null && <ProspectEditor key={editing === "new" ? "new" : editing.id} prospect={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={handleSave} />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImport={handleImport} />}
      {salesScriptProspect && <SalesScriptDialog key={salesScriptProspect.id} prospect={salesScriptProspect} onClose={() => setSalesScriptProspect(null)} />}
    </div>
  );
}
