import { useEffect, useRef, useState } from "react";
import { Check, Copy, FileText, MessageCircle, X } from "lucide-react";
import type { Prospect } from "@/lib/supabase";
import {
  domainPricingWarning,
  mockupScopeNote,
  recommendedScriptForStatus,
  salesConversationSteps,
  salesFieldDefinitions,
  salesFollowupChecklist,
  salesManagerIndicators,
  salesObservationExamples,
  salesObjections,
  salesOffers,
  salesOfferUseCases,
  salesPlaybookSources,
  salesQualificationQuestions,
  salesScriptBlocks,
  salesTeamDistribution,
  salesTeamRules,
  type SalesContext,
  type SalesFieldId,
} from "@/lib/salesPlaybook";

interface SalesScriptDialogProps {
  prospect: Prospect;
  onClose: () => void;
}

type PlaybookTab = "scripts" | "offers" | "objections" | "team";

const fieldIds = Object.keys(salesFieldDefinitions) as SalesFieldId[];
const blankValues = (): Record<SalesFieldId, string> =>
  Object.fromEntries(fieldIds.map(id => [id, ""])) as Record<SalesFieldId, string>;

function getWhatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("212") ? digits : digits.startsWith("0") ? `212${digits.slice(1)}` : "";
  return /^212\d{9}$/.test(normalized) ? normalized : "";
}

const tabs: Array<{ id: PlaybookTab; label: string }> = [
  { id: "scripts", label: "Scripts" },
  { id: "offers", label: "Offres" },
  { id: "objections", label: "Objections" },
  { id: "team", label: "Méthode & équipe" },
];

const commercialTermIds: SalesFieldId[] = ["domainTerms", "hostingTerms", "renewalTerms"];
const unconfirmedValuePattern = /\[[^\]]+\]|\{[^}]+\}|\b(?:à|a) confirmer\b|\b(?:à|a) préciser\b|\bnon renseigné\b|\binconnu\b|\btbd\b/i;

const isUnconfirmedValue = (value: string) => !value.trim() || unconfirmedValuePattern.test(value);
const followupBlockIds = new Set(["followup-proposal", "followup-precision", "quiet-close"]);

type ContactDisposition = "unreviewed" | "no-rejection" | "opted-out";

function parsePositivePrice(value: string) {
  const normalized = value.trim().replace(/[\s\u00a0]/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

const normalizeOfferName = (value: string) => value.trim().toLocaleLowerCase("fr").replace(/^pack\s+/, "");

export default function SalesScriptDialog({ prospect, onClose }: SalesScriptDialogProps) {
  const recommendedId = recommendedScriptForStatus[prospect.status] || "";
  const [activeTab, setActiveTab] = useState<PlaybookTab>("scripts");
  const [selectedBlockId, setSelectedBlockId] = useState(followupBlockIds.has(recommendedId) ? "" : recommendedId);
  const [values, setValues] = useState<Record<SalesFieldId, string>>(blankValues);
  const [copiedLabel, setCopiedLabel] = useState("");
  const [copyError, setCopyError] = useState("");
  const [priceTermsVerified, setPriceTermsVerified] = useState(false);
  const [contactDisposition, setContactDisposition] = useState<ContactDisposition>("unreviewed");
  const [quietCloseVerified, setQuietCloseVerified] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setActiveTab("scripts");
    setSelectedBlockId(followupBlockIds.has(recommendedId) ? "" : recommendedId);
    setValues(blankValues());
    setCopiedLabel("");
    setCopyError("");
    setPriceTermsVerified(false);
    setContactDisposition("unreviewed");
    setQuietCloseVerified(false);
  }, [prospect.id, recommendedId]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";
    dialog?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  const selectedBlock = salesScriptBlocks.find(block => block.id === selectedBlockId) || null;
  const context: SalesContext = {
    ...values,
    company: prospect.entreprise?.trim() || "votre entreprise",
    city: prospect.ville?.trim() || "",
    phone: prospect.telephone?.trim() || "",
    status: prospect.status?.trim() || "",
    price: values.price.trim().replace(/\s*(?:DH|MAD)$/i, "").trim(),
  };
  const missingFields = selectedBlock?.requiredFields.filter(id => !context[id].trim()) || [];
  const baseScriptText = selectedBlock?.build(context).trim() || "";
  const priceNeedsVerification = Boolean(selectedBlock?.fields.includes("price") && context.price.trim() && baseScriptText.includes(`${context.price} DH`));
  const numericPrice = parsePositivePrice(context.price);
  const matchingOffer = salesOffers.find(offer => normalizeOfferName(offer.name) === normalizeOfferName(context.pack));
  const expectedOfferPrice = matchingOffer ? parsePositivePrice(matchingOffer.price) : null;
  const priceIsValid = numericPrice !== null && (expectedOfferPrice === null || numericPrice === expectedOfferPrice);
  const missingCommercialTerms = [
    ...(priceNeedsVerification && !priceIsValid ? ["price" as SalesFieldId] : []),
    ...commercialTermIds.filter(id => isUnconfirmedValue(context[id])),
  ];
  const commercialTermsReady = missingCommercialTerms.length === 0;
  const isFollowupBlock = followupBlockIds.has(selectedBlockId);
  const followupNeedsReview = isFollowupBlock && contactDisposition !== "no-rejection";
  const contactNeedsReview = contactDisposition !== "no-rejection";
  const outreachBlocked = contactDisposition === "opted-out";
  const quietCloseNeedsReview = selectedBlockId === "quiet-close" && !quietCloseVerified;
  const commercialTermsText = priceNeedsVerification && priceIsValid && commercialTermsReady
    ? `\n\nConditions commerciales confirmées : domaine — ${context.domainTerms}; hébergement — ${context.hostingTerms}; renouvellement — ${context.renewalTerms}.`
    : "";
  const scriptText = `${baseScriptText}${commercialTermsText}`.trim();
  const unresolvedPlaceholder = /\[[^\]]+\]|\{[^}]+\}/.test(scriptText);
  const scriptReady = Boolean(selectedBlock) && !contactNeedsReview && !followupNeedsReview && !quietCloseNeedsReview && missingFields.length === 0 && scriptText.length > 0 && !unresolvedPlaceholder && (!priceNeedsVerification || (priceIsValid && commercialTermsReady && priceTermsVerified));
  const recommendedBlock = recommendedId && !followupBlockIds.has(recommendedId) ? salesScriptBlocks.find(block => block.id === recommendedId) || null : null;
  const whatsappNumber = getWhatsappNumber(context.phone);
  const whatsappUrl = scriptReady && selectedBlock?.channel === "WhatsApp" && whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(scriptText)}`
    : "";

  const updateField = (id: SalesFieldId, value: string) => {
    setValues(current => ({ ...current, [id]: value }));
    setCopyError("");
    setCopiedLabel("");
    if (id === "pack" || id === "price" || id === "relevantElements" || commercialTermIds.includes(id)) {
      setPriceTermsVerified(false);
    }
  };

  const updateContactDisposition = (disposition: ContactDisposition) => {
    setContactDisposition(disposition);
    setQuietCloseVerified(false);
    setCopiedLabel("");
    setCopyError("");
    if (disposition === "opted-out" || (disposition !== "no-rejection" && followupBlockIds.has(selectedBlockId))) {
      setSelectedBlockId("");
      setPriceTermsVerified(false);
    }
  };

  const copyText = async (value: string, label: string, requireReady = true) => {
    if (outreachBlocked) {
      setCopyError("Le prospect a refusé ou demandé l’arrêt du suivi : ne copiez ni n’envoyez aucun message.");
      return;
    }
    if (contactNeedsReview) {
      setCopyError("Vérifiez l’historique et confirmez l’absence de refus ou de demande d’arrêt avant de copier un texte destiné au prospect.");
      return;
    }
    if (requireReady && !scriptReady) {
      setCopyError("Complétez les informations requises et confirmez les conditions commerciales avant la copie.");
      return;
    }
    setCopyError("");
    try {
      await navigator.clipboard.writeText(value);
      setCopiedLabel(label);
      window.setTimeout(() => setCopiedLabel(current => current === label ? "" : current), 2400);
    } catch {
      setCopyError("La copie automatique n’est pas disponible dans ce navigateur.");
    }
  };

  const copyObjection = (objection: string, response: string) =>
    void copyText(`${objection}\n\n${response}`, objection, false);

  const renderScriptFields = () => {
    if (!selectedBlock) return null;
    return (
      <div className="sales-playbook-fields">
        {selectedBlock.fields.map(id => {
        const definition = salesFieldDefinitions[id];
        const required = selectedBlock.requiredFields.includes(id);
        return (
          <label className="sales-playbook-field" key={id}>
            <span>{definition.label}{required ? <b aria-hidden="true"> *</b> : null}</span>
            {definition.multiline ? (
              <textarea
                value={values[id]}
                onChange={event => updateField(id, event.target.value)}
                placeholder={definition.placeholder}
                rows={2}
                data-initial-focus={id === selectedBlock.fields[0] ? "true" : undefined}
                aria-required={required}
              />
            ) : (
              <input
                type={id === "price" ? "number" : "text"}
                min={id === "price" ? 1 : undefined}
                step={id === "price" ? "any" : undefined}
                value={values[id]}
                onChange={event => updateField(id, event.target.value)}
                placeholder={definition.placeholder}
                data-initial-focus={id === selectedBlock.fields[0] ? "true" : undefined}
                aria-required={required}
                autoComplete="off"
              />
            )}
            {definition.help ? <small>{definition.help}</small> : null}
          </label>
        );
        })}
      </div>
    );
  };

  const renderScriptsTab = () => (
    <div className="sales-playbook-panel" role="tabpanel" id="sales-panel-scripts" aria-labelledby="sales-tab-scripts">
      <div className="sales-playbook-recommendation">
        <div>
          <span className="sales-playbook-kicker">ÉTAPE ACTUELLE</span>
          <strong>{context.status || "Statut non renseigné"}</strong>
        </div>
        {recommendedBlock ? (
          <p>Suggestion : <b>{recommendedBlock.title}</b>. Choisissez le bloc qui correspond à la conversation réelle.</p>
        ) : (
          <p>Aucun script n’est présélectionné. Vérifiez le motif avant tout suivi; après un refus ou une demande d’arrêt, ne recontactez pas le prospect.</p>
        )}
      </div>

      <label className="sales-playbook-select-label" htmlFor="sales-contact-disposition">Vérifier l’historique avant tout suivi</label>
      <select
        id="sales-contact-disposition"
        className="sales-playbook-select"
        value={contactDisposition}
        onChange={event => updateContactDisposition(event.target.value as ContactDisposition)}
      >
        <option value="unreviewed">Historique non vérifié — relances désactivées</option>
        <option value="no-rejection">Historique vérifié : aucun refus ni demande d’arrêt</option>
        <option value="opted-out">Refus ou demande d’arrêt : ne plus contacter</option>
      </select>
      {outreachBlocked ? (
        <div className="sales-playbook-missing" role="alert">Le prospect a refusé ou demandé à ne plus être contacté. Aucun script, objection copiée ou message WhatsApp ne peut être préparé depuis ce module.</div>
      ) : contactDisposition === "unreviewed" ? (
        <p className="sales-playbook-trigger">Vérifiez l’historique avant tout message : aucune copie ni aucun préremplissage ne sera autorisé tant que l’absence de refus ou de demande d’arrêt n’est pas confirmée. Cette vérification temporaire n’est pas enregistrée dans la fiche.</p>
      ) : null}

      <label className="sales-playbook-select-label" htmlFor="sales-script-block">Déclencheur et canal</label>
      <select
        id="sales-script-block"
        className="sales-playbook-select"
        value={selectedBlockId}
        disabled={outreachBlocked}
        onChange={event => {
          setSelectedBlockId(event.target.value);
          setQuietCloseVerified(false);
          setValues(current => ({
            ...current,
            pack: "",
            price: "",
            relevantElements: "",
            domainTerms: "",
            hostingTerms: "",
            renewalTerms: "",
          }));
          setPriceTermsVerified(false);
          setCopiedLabel("");
        }}
        data-initial-focus
      >
        <option value="">Choisir un script après vérification du contexte</option>
        {salesScriptBlocks.map(block => (
          <option key={block.id} value={block.id} disabled={followupBlockIds.has(block.id) && contactDisposition !== "no-rejection"}>{block.channel} — {block.title}</option>
        ))}
      </select>
      {selectedBlock ? <p className="sales-playbook-trigger">{selectedBlock.trigger}</p> : null}
      {selectedBlockId === "quiet-close" ? (
        <label className="sales-playbook-confirm-check">
          <input type="checkbox" checked={quietCloseVerified} onChange={event => setQuietCloseVerified(event.target.checked)} />
          <span>J’ai vérifié qu’il n’y a eu aucune réponse après deux relances espacées (2–3 jours ouvrés, puis environ une semaine), et aucune demande d’arrêt.</span>
        </label>
      ) : null}

      {selectedBlock?.fields.length ? renderScriptFields() : null}

      {selectedBlock?.fields.includes("price") ? (
        <div className="sales-playbook-alert sales-playbook-price-confirmation" role="note">
          <strong>Vérification commerciale avant copie</strong>
          <p>{domainPricingWarning}</p>
          <div className="sales-playbook-fields sales-playbook-price-fields">
            {commercialTermIds.map(id => {
              const definition = salesFieldDefinitions[id];
              return (
                <label key={id} className="sales-playbook-field">
                  <span>{definition.label} <i aria-hidden="true">*</i></span>
                  <textarea
                    value={context[id]}
                    placeholder={definition.placeholder}
                    onChange={event => updateField(id, event.target.value)}
                    aria-required="true"
                    rows={2}
                  />
                  {definition.help ? <small>{definition.help}</small> : null}
                </label>
              );
            })}
          </div>
          {priceNeedsVerification && missingCommercialTerms.length ? (
            <p className="sales-playbook-price-missing" role="alert">
              {missingCommercialTerms.includes("price") && !numericPrice
                ? "Saisissez un montant positif en chiffres (DH), sans texte provisoire. "
                : missingCommercialTerms.includes("price")
                  ? "Le montant ne correspond pas au tarif publié de ce pack standard. "
                  : ""}
              Renseignez une valeur vérifiée pour : {missingCommercialTerms.map(id => salesFieldDefinitions[id].label).join(" · ")}.
            </p>
          ) : null}
          <label className="sales-playbook-confirm-check">
            <input
              type="checkbox"
              checked={priceTermsVerified}
              disabled={!priceIsValid || !commercialTermsReady}
              onChange={event => setPriceTermsVerified(event.target.checked)}
            />
            <span>J’ai validé les valeurs ci-dessus avec la règle commerciale en vigueur et je les inclus dans le message.</span>
          </label>
        </div>
      ) : null}

      {missingFields.length ? (
        <div className="sales-playbook-missing" role="alert">
          Complétez avant de copier : {missingFields.map(id => salesFieldDefinitions[id].label).join(" · ")}.
        </div>
      ) : null}
      {unresolvedPlaceholder ? (
        <div className="sales-playbook-missing" role="alert">Le message contient encore une variable à remplacer; il n’est pas copiable.</div>
      ) : null}

      {scriptReady ? (
        <section className="sales-playbook-preview" aria-label="Aperçu du script généré">
          <div className="sales-playbook-preview-heading"><span>Aperçu prêt à relire</span><span>{selectedBlock?.channel}</span></div>
          <pre>{scriptText}</pre>
        </section>
      ) : (
        <div className="sales-playbook-empty-preview">
          {outreachBlocked
            ? "Aucun message ne peut être préparé après un refus ou une demande d’arrêt."
            : contactNeedsReview
              ? "Vérifiez l’historique et confirmez l’absence de refus ou de demande d’arrêt avant toute copie ou tout envoi."
              : quietCloseNeedsReview
                ? "La clôture silencieuse exige la vérification de deux relances espacées, sans réponse ni demande d’arrêt."
                : !selectedBlock
            ? "Choisissez un script uniquement après avoir vérifié le motif et l’historique du prospect."
            : priceNeedsVerification && !priceTermsVerified
              ? "Saisissez un prix numérique valide et confirmez les conditions commerciales pour activer la copie."
              : "Le texte complet apparaîtra lorsque les informations obligatoires seront renseignées."}
        </div>
      )}

      {selectedBlock?.channel === "E-mail" ? (
        <p className="sales-playbook-note">L’adresse e-mail du prospect n’est pas présente dans la fiche actuelle : copiez le texte, vérifiez le destinataire et relisez-le avant l’envoi.</p>
      ) : selectedBlock?.channel === "WhatsApp" ? (
        <p className="sales-playbook-note">WhatsApp s’ouvrira avec le message prérempli. Il ne sera envoyé qu’après vérification et validation manuelle dans WhatsApp.</p>
      ) : selectedBlock ? (
        <p className="sales-playbook-note">Il s’agit d’un guide d’appel : adaptez-le à la réponse du prospect et ne récitez pas toutes les questions.</p>
      ) : (
        <p className="sales-playbook-note">Pour le statut « Perdu », le module ne recommande aucune relance par défaut.</p>
      )}
    </div>
  );

  const renderOffersTab = () => (
    <div className="sales-playbook-panel" role="tabpanel" id="sales-panel-offers" aria-labelledby="sales-tab-offers">
      <div className="sales-playbook-alert" role="note">
        <strong>À valider avant de chiffrer</strong>
        <p>{domainPricingWarning}</p>
      </div>
      <p className="sales-playbook-intro">Présentez d’abord le résultat attendu, puis deux ou trois fonctionnalités directement utiles au besoin. Énoncez le prix du pack et les options séparément.</p>
      <div className="sales-playbook-offers">
        {salesOffers.map(offer => (
          <article className="sales-playbook-offer" key={offer.name}>
            <div className="sales-playbook-offer-heading"><h3>{offer.name}</h3><strong>{offer.price}</strong></div>
            <ul>{offer.items.map(item => <li key={item}>{item}</li>)}</ul>
            <p className="sales-playbook-offer-use">{salesOfferUseCases[offer.name]}</p>
            <p>{offer.note}</p>
          </article>
        ))}
      </div>
      <div className="sales-playbook-caution">
        <strong>Google Business Profile et SEO</strong>
        <p>Le playbook ne confirme pas que la fiche Google est offerte. Présentez toute aide sous réserve d’éligibilité, de validation et de données exactes. Ne promettez ni validation automatique, ni première position, ni délai de classement.</p>
      </div>
      <div className="sales-playbook-sources">
        <strong>Références du playbook</strong>
        {salesPlaybookSources.map(source => <a href={source.url} key={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>)}
      </div>
    </div>
  );

  const renderObjectionsTab = () => (
    <div className="sales-playbook-panel" role="tabpanel" id="sales-panel-objections" aria-labelledby="sales-tab-objections">
      <p className="sales-playbook-intro">Répondez à l’objection exprimée, puis posez une question ouverte. Ne cherchez pas à convaincre à tout prix.</p>
      <div className="sales-objections sales-playbook-objections">
        {salesObjections.map(item => (
          <details className="sales-objection" key={item.objection}>
            <summary>{item.objection}</summary>
            <p>{item.response}</p>
            <button className="sales-copy-button" type="button" disabled={contactNeedsReview} onClick={() => copyObjection(item.objection, item.response)}>
              {copiedLabel === item.objection ? <Check size={13} /> : <Copy size={13} />}
              {copiedLabel === item.objection ? "Copié" : "Copier cette réponse"}
            </button>
          </details>
        ))}
      </div>
      {copyError || copiedLabel ? <p className="sales-playbook-feedback" aria-live="polite">{copyError || "Texte copié dans le presse-papiers."}</p> : null}
    </div>
  );

  const renderTeamTab = () => (
    <div className="sales-playbook-panel" role="tabpanel" id="sales-panel-team" aria-labelledby="sales-tab-team">
      <section className="sales-playbook-section">
        <h3>La méthode en six étapes</h3>
        <ol>{salesConversationSteps.map(step => <li key={step}>{step}</li>)}</ol>
      </section>
      <details className="sales-playbook-details">
        <summary>Questions de qualification possibles</summary>
        <p className="sales-playbook-note">Choisissez quatre à six questions selon la conversation; ne les posez pas toutes d’un coup.</p>
        <ol>{salesQualificationQuestions.map(question => <li key={question}>{question}</li>)}</ol>
      </details>
      <section className="sales-playbook-section">
        <h3>Relier une observation vérifiée à une piste</h3>
        <p className="sales-playbook-note">Ne présentez jamais une hypothèse comme un fait. Utilisez ces exemples uniquement si l’observation correspond réellement au prospect.</p>
        <div className="sales-playbook-observations">
          {salesObservationExamples.map(item => (
            <article className="sales-playbook-observation" key={item.situation}>
              <strong>{item.situation}</strong>
              <p><b>À vérifier :</b> {item.observation}</p>
              <p><b>Piste :</b> {item.piste}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="sales-playbook-section sales-playbook-mockup">
        <h3>Maquette gratuite : cadrer la valeur</h3>
        <p>{mockupScopeNote}</p>
        <ul>
          <li>Demandez l’accord du prospect et convenez du périmètre et du délai avant de commencer.</li>
          <li>Précisez ce qu’elle permet de visualiser et ce qu’elle ne promet pas : développement complet, mise en ligne, accès aux fichiers ou révisions illimitées.</li>
          <li>À la présentation, expliquez les choix, demandez ce qui fonctionne et relevez les ajustements avant le devis final.</li>
        </ul>
      </section>
      <section className="sales-playbook-section">
        <h3>Après chaque échange : informations à consigner</h3>
        <ul>{salesFollowupChecklist.map(item => <li key={item}>{item}</li>)}</ul>
        <p className="sales-playbook-note">Repère de travail : la fiche CRM actuelle ne stocke pas encore cet historique détaillé. Les champs complétés dans ce module sont temporaires et ne sont pas enregistrés au prospect.</p>
      </section>
      <section className="sales-playbook-section">
        <h3>Répartition des responsabilités</h3>
        <ul>{salesTeamDistribution.map(item => <li key={item}>{item}</li>)}</ul>
        <p className="sales-playbook-note">Le document source décrit une équipe de cinq personnes; ces responsabilités peuvent se chevaucher dans votre équipe actuelle.</p>
      </section>
      <section className="sales-playbook-section">
        <h3>Indicateurs pour le responsable</h3>
        <ul>{salesManagerIndicators.map(item => <li key={item}>{item}</li>)}</ul>
        <p className="sales-playbook-note">Ce sont des repères de suivi à consigner dans l’outil d’équipe; ils ne sont pas encore calculés automatiquement par le CRM.</p>
      </section>
      <section className="sales-playbook-section">
        <h3>Garde-fous et relances</h3>
        <ul>{salesTeamRules.map(rule => <li key={rule}>{rule}</li>)}</ul>
      </section>
      <div className="sales-playbook-sources">
        <strong>Ressources à consulter</strong>
        {salesPlaybookSources.map(source => <a href={source.url} key={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>)}
      </div>
    </div>
  );

  return (
    <div className="modal-backdrop sales-script-backdrop" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="modal-card sales-script-modal sales-playbook-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-script-title"
        tabIndex={-1}
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="modal-heading sales-script-heading sales-playbook-header">
          <div>
            <span className="eyebrow">OUTIL COMMERCIAL · WEBORA</span>
            <h2 id="sales-script-title">Playbook de prospection</h2>
            <p className="modal-subtitle">{context.company}{context.city ? ` · ${context.city}` : ""}{context.status ? ` · ${context.status}` : ""}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fermer le playbook"><X size={17} /></button>
        </header>

        <nav className="sales-playbook-tabs" role="tablist" aria-label="Rubriques du playbook Webora">
          {tabs.map(tab => (
            <button
              id={`sales-tab-${tab.id}`}
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`sales-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={activeTab === tab.id ? "sales-playbook-tab is-active" : "sales-playbook-tab"}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={event => {
                const currentIndex = tabs.findIndex(item => item.id === tab.id);
                let nextIndex: number | null = null;
                if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
                else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                else if (event.key === "Home") nextIndex = 0;
                else if (event.key === "End") nextIndex = tabs.length - 1;
                if (nextIndex === null) return;
                event.preventDefault();
                const nextTab = tabs[nextIndex];
                setActiveTab(nextTab.id);
                document.getElementById(`sales-tab-${nextTab.id}`)?.focus();
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="sales-playbook-body">
          {activeTab === "scripts" ? renderScriptsTab() : null}
          {activeTab === "offers" ? renderOffersTab() : null}
          {activeTab === "objections" ? renderObjectionsTab() : null}
          {activeTab === "team" ? renderTeamTab() : null}
        </div>

        {activeTab === "scripts" ? (
          <footer className="sales-playbook-footer">
            <div className="sales-playbook-feedback" aria-live="polite">{copyError || (copiedLabel ? `${copiedLabel} copié.` : "")}</div>
            <div className="sales-playbook-actions">
              <button className="button button-quiet button-small" type="button" disabled={!scriptReady} onClick={() => void copyText(scriptText, "Script") }>
                {copiedLabel === "Script" ? <Check size={14} /> : <Copy size={14} />}
                {!selectedBlock ? "Choisir un script" : selectedBlock.channel === "E-mail" ? "Copier l’e-mail" : selectedBlock.channel === "Appel" ? "Copier le guide d’appel" : "Copier le message"}
              </button>
              {selectedBlock?.channel === "WhatsApp" ? (
                whatsappUrl ? (
                  <a className="button button-primary button-small sales-whatsapp-button" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle size={15} />Préparer WhatsApp
                  </a>
                ) : (
                  <button className="button button-quiet button-small" type="button" disabled title={!scriptReady ? "Complétez d’abord les champs obligatoires" : "Ajoutez un numéro marocain valide au prospect"}>
                    <MessageCircle size={15} />WhatsApp indisponible
                  </button>
                )
              ) : null}
              <button className="button button-quiet button-small" type="button" onClick={onClose}><FileText size={14} />Terminer</button>
            </div>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
