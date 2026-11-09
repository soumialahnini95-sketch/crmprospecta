import { useRef, useState, type ChangeEvent } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { normalizeMoroccanPhone, PROSPECT_STATUSES, type ProspectDraft } from "@/lib/supabase";

interface ImportDialogProps {
  onClose: () => void;
  onImport: (rows: ProspectDraft[]) => Promise<number>;
}

const HEADER_ALIASES: Record<string, keyof ProspectDraft> = {
  entreprise: "entreprise", company: "entreprise", société: "entreprise", societe: "entreprise", organization: "entreprise", organisation: "entreprise",
  telephone: "telephone", téléphone: "telephone", phone: "telephone", tel: "telephone", mobile: "telephone",
  ville: "ville", city: "ville", locality: "ville",
  status: "status", statut: "status", étape: "status", etape: "status", stage: "status",
  secteur: "secteur", sector: "secteur", industry: "secteur", industrie: "secteur",
};

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("fr-FR").replace(/\s+/g, " ");
}

function parseStatus(value: string): ProspectDraft["status"] | null {
  if (!value.trim()) return "À contacter";
  const found = PROSPECT_STATUSES.find(status => status.toLocaleLowerCase("fr-FR") === value.trim().toLocaleLowerCase("fr-FR"));
  return found ?? null;
}

export default function ImportDialog({ onClose, onImport }: ImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ProspectDraft[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setRows([]);
    setError("");
    setResult("");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("Le fichier ne contient aucune feuille lisible.");
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "", raw: false });
      const headings = matrix[0]?.map(normalizeHeader) ?? [];
      const columns = headings.map(header => HEADER_ALIASES[header] ?? null);
      if (!columns.includes("entreprise")) {
        throw new Error("Une colonne « entreprise » est obligatoire. Les colonnes reconnues : entreprise, téléphone, ville, statut et secteur.");
      }
      const imported: ProspectDraft[] = [];
      let ignored = 0;
      for (const line of matrix.slice(1)) {
        const record: Partial<Record<keyof ProspectDraft, string>> = {};
        line.forEach((value, index) => {
          const column = columns[index];
          if (column) record[column] = String(value ?? "").trim();
        });
        if (!record.entreprise) {
          if (line.some(value => String(value ?? "").trim())) ignored++;
          continue;
        }
        const status = parseStatus(record.status ?? "");
        if (!status) {
          ignored++;
          continue;
        }
        let telephone: string;
        try {
          telephone = normalizeMoroccanPhone(record.telephone ?? "");
        } catch {
          ignored++;
          continue;
        }
        imported.push({
          entreprise: record.entreprise,
          telephone,
          ville: record.ville ?? "",
          status,
          secteur: record.secteur ?? "",
        });
      }
      setRows(imported);
      setSkipped(ignored);
      if (!imported.length) setError("Aucune ligne valide. Vérifiez que les données suivent la ligne d’en-tête.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de lire ce fichier.");
    }
  };

  const importRows = async () => {
    setBusy(true);
    setError("");
    try {
      const count = await onImport(rows);
      setResult(`${count} prospect${count === 1 ? " importé" : "s importés"}${skipped ? ` · ${skipped} ligne${skipped > 1 ? "s" : ""} ignorée${skipped > 1 ? "s" : ""} (entreprise, statut ou téléphone invalide)` : ""}.`);
      setRows([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L’import a échoué.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card import-card" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="modal-heading">
          <div>
            <span className="eyebrow">IMPORT DE FICHIER</span>
            <h2 id="import-title">Importer des contacts</h2>
            <p className="modal-subtitle">CSV ou Excel · vos colonnes restent dans votre espace sécurisé.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <input ref={inputRef} className="visually-hidden" type="file" accept=".csv,.xlsx,.xls" onChange={readFile} />
        <button className="drop-zone" type="button" onClick={() => inputRef.current?.click()}>
          {rows.length ? <FileSpreadsheet size={24} /> : <Upload size={24} />}
          <strong>{fileName || "Choisir un fichier CSV ou Excel"}</strong>
          <span>{rows.length ? `${rows.length} lignes prêtes à importer` : "En-têtes reconnus : entreprise, téléphone, ville, statut, secteur"}</span>
        </button>
        {rows.length > 0 && <div className="import-preview"><span>Aperçu</span><strong>{rows.length} contacts valides</strong><p>{rows.slice(0, 3).map(row => row.entreprise).join(" · ")}{rows.length > 3 ? " …" : ""}</p></div>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        {result && <p className="inline-success" role="status">{result}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>Fermer</button>
          <button type="button" className="button button-primary" disabled={busy || rows.length === 0} onClick={importRows}>{busy ? "Import en cours…" : `Importer ${rows.length || ""} contact${rows.length === 1 ? "" : "s"}`}</button>
        </div>
      </section>
    </div>
  );
}
