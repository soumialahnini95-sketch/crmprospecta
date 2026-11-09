import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { normalizeMoroccanPhone, PROSPECT_STATUSES, type Prospect, type ProspectDraft } from "@/lib/supabase";

interface ProspectEditorProps {
  prospect?: Prospect | null;
  onClose: () => void;
  onSave: (draft: ProspectDraft, id?: string) => Promise<void>;
}

const EMPTY_DRAFT: ProspectDraft = {
  entreprise: "",
  telephone: "+212 ",
  ville: "",
  status: "À contacter",
  secteur: "",
};

const MOROCCAN_CITIES = [
  "Agadir", "Béni Mellal", "Casablanca", "Dakhla", "El Jadida", "Essaouira", "Fès",
  "Kénitra", "Khouribga", "Laâyoune", "Marrakech", "Meknès", "Mohammedia", "Nador",
  "Ouarzazate", "Oujda", "Rabat", "Safi", "Salé", "Settat", "Tanger", "Taza", "Tétouan",
];

export default function ProspectEditor({ prospect, onClose, onSave }: ProspectEditorProps) {
  const [draft, setDraft] = useState<ProspectDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(prospect ? {
      entreprise: prospect.entreprise,
      telephone: prospect.telephone,
      ville: prospect.ville,
      status: prospect.status,
      secteur: prospect.secteur,
    } : EMPTY_DRAFT);
  }, [prospect]);

  const setField = <K extends keyof ProspectDraft>(field: K, value: ProspectDraft[K]) => {
    setDraft(current => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ ...draft, telephone: normalizeMoroccanPhone(draft.telephone) }, prospect?.id);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L'enregistrement a échoué.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="prospect-editor-title">
        <div className="modal-heading">
          <div>
            <span className="eyebrow">FICHE PROSPECT</span>
            <h2 id="prospect-editor-title">{prospect ? "Modifier le prospect" : "Nouveau prospect"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="editor-form">
          <label className="field-label">Entreprise <span>*</span>
            <input autoFocus required maxLength={180} value={draft.entreprise} onChange={event => setField("entreprise", event.target.value)} placeholder="Nom de l’entreprise" />
          </label>
          <div className="field-grid">
            <label className="field-label">Téléphone (Maroc)
              <input type="tel" maxLength={32} value={draft.telephone} onChange={event => setField("telephone", event.target.value)} placeholder="+212 6 12 34 56 78" />
            </label>
            <label className="field-label">Ville (Maroc)
              <input list="moroccan-cities" maxLength={120} value={draft.ville} onChange={event => setField("ville", event.target.value)} placeholder="Casablanca" />
              <datalist id="moroccan-cities">
                {MOROCCAN_CITIES.map(city => <option key={city} value={city} />)}
              </datalist>
            </label>
          </div>
          <div className="field-grid">
            <label className="field-label">Secteur
              <input maxLength={120} value={draft.secteur} onChange={event => setField("secteur", event.target.value)} placeholder="Conseil, industrie…" />
            </label>
            <label className="field-label">Étape
              <select value={draft.status} onChange={event => setField("status", event.target.value as ProspectDraft["status"])}>
                {PROSPECT_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="button button-quiet" onClick={onClose}>Annuler</button>
            <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Enregistrement…" : prospect ? "Enregistrer" : "Ajouter le prospect"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
