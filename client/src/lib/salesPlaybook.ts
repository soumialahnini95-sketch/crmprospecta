export type SalesChannel = "WhatsApp" | "E-mail" | "Appel";

export type SalesFieldId =
  | "contactName"
  | "advisorName"
  | "activity"
  | "sourceContext"
  | "observedItem"
  | "possibleImpact"
  | "objective"
  | "confirmedProblem"
  | "priority"
  | "pack"
  | "price"
  | "relevantElements"
  | "domainTerms"
  | "hostingTerms"
  | "renewalTerms"
  | "slot1"
  | "slot2"
  | "requestTopic"
  | "pageOrPath"
  | "designChoice"
  | "desiredAction"
  | "projectSummary"
  | "blockingPoint"
  | "scope"
  | "customerMaterials"
  | "nextAction"
  | "nextDate";

export type SalesContext = Record<SalesFieldId, string> & {
  company: string;
  city: string;
  phone: string;
  status: string;
};

export interface SalesFieldDefinition {
  label: string;
  placeholder: string;
  help?: string;
  multiline?: boolean;
}

export interface SalesScriptBlock {
  id: string;
  title: string;
  trigger: string;
  channel: SalesChannel;
  fields: readonly SalesFieldId[];
  requiredFields: readonly SalesFieldId[];
  build: (context: SalesContext) => string;
}

const greeting = (context: SalesContext) =>
  context.contactName ? `Bonjour ${context.contactName},` : "Bonjour,";
const advisor = (context: SalesContext) => context.advisorName || "un conseiller Webora";
const maybe = (label: string, value: string) => (value ? `${label}${value}` : "");
const cityPhrase = (context: SalesContext) => (context.city ? ` à ${context.city}` : "");

export const salesFieldDefinitions: Record<SalesFieldId, SalesFieldDefinition> = {
  contactName: {
    label: "Prénom de l’interlocuteur",
    placeholder: "Ex. Salma",
    help: "Facultatif : si absent, le script commence simplement par « Bonjour ». ",
  },
  advisorName: {
    label: "Nom du conseiller",
    placeholder: "Ex. Yassine",
    help: "Utilisé dans les blocs qui présentent le conseiller à la personne contactée.",
  },
  activity: {
    label: "Activité confirmée",
    placeholder: "Ex. cabinet dentaire, pâtisserie, location…",
  },
  sourceContext: {
    label: "Source ou contexte réel de découverte",
    placeholder: "Ex. recommandation de…, recherche Google le…",
    help: "Indiquez uniquement comment l’entreprise a réellement été découverte.",
    multiline: true,
  },
  observedItem: {
    label: "Observation factuelle vérifiée",
    placeholder: "Ex. le catalogue est réparti entre plusieurs publications",
    help: "Décrivez un fait observé ou rapporté, sans présenter une hypothèse comme un fait.",
    multiline: true,
  },
  possibleImpact: {
    label: "Conséquence possible à confirmer avec le prospect",
    placeholder: "Ex. les visiteurs peuvent avoir du mal à trouver les coordonnées",
    help: "Formulez cela comme une piste, pas comme un préjudice établi.",
    multiline: true,
  },
  objective: {
    label: "Objectif exprimé par le prospect",
    placeholder: "Ex. recevoir des demandes de devis depuis le site",
    multiline: true,
  },
  confirmedProblem: {
    label: "Frein ou problème confirmé par le prospect",
    placeholder: "Ex. les demandes arrivent sur plusieurs canaux et se perdent",
    multiline: true,
  },
  priority: {
    label: "Priorité reformulée",
    placeholder: "Ex. simplifier la prise de rendez-vous",
    multiline: true,
  },
  pack: {
    label: "Pack conseillé",
    placeholder: "Ex. Pack Essentiel",
  },
  price: {
    label: "Prix confirmé du pack (DH, chiffres uniquement)",
    placeholder: "Ex. 999",
    help: "Saisissez un montant positif en chiffres. Pour un pack standard, utilisez son tarif publié; pour un projet personnalisé, saisissez le montant du devis déjà validé.",
  },
  relevantElements: {
    label: "Éléments du pack directement utiles",
    placeholder: "Ex. 4 pages, boutons WhatsApp, hébergement 12 mois",
    multiline: true,
  },
  slot1: {
    label: "Premier créneau proposé",
    placeholder: "Ex. mardi à 11 h",
  },
  slot2: {
    label: "Deuxième créneau proposé",
    placeholder: "Ex. mercredi à 15 h",
  },
  requestTopic: {
    label: "Demande ou sujet réel du prospect",
    placeholder: "Ex. présenter ses services et recevoir des demandes",
    multiline: true,
  },
  pageOrPath: {
    label: "Page ou parcours de la maquette",
    placeholder: "Ex. page d’accueil avec accès direct aux services",
    multiline: true,
  },
  designChoice: {
    label: "Choix de conception à expliquer",
    placeholder: "Ex. bouton de réservation visible dès l’accueil",
    multiline: true,
  },
  desiredAction: {
    label: "Action que la maquette doit faciliter",
    placeholder: "Ex. demander un devis par WhatsApp",
    multiline: true,
  },
  projectSummary: {
    label: "Projet ou récapitulatif réellement envoyé",
    placeholder: "Ex. Pack Essentiel et maquette de la page d’accueil",
    multiline: true,
  },
  blockingPoint: {
    label: "Point qui bloque, s’il a été exprimé",
    placeholder: "Ex. le budget ou le calendrier",
    multiline: true,
  },
  scope: {
    label: "Périmètre validé pour l’offre ou le devis",
    placeholder: "Ex. 4 pages, boutons WhatsApp et formulaire de contact",
    multiline: true,
  },
  customerMaterials: {
    label: "Contenus nécessaires du client",
    placeholder: "Ex. logo, textes des services, coordonnées et photos",
    multiline: true,
  },
  nextAction: {
    label: "Prochaine action convenue",
    placeholder: "Ex. envoyer le devis puis présenter la maquette",
    multiline: true,
  },
  nextDate: {
    label: "Date ou échéance convenue",
    placeholder: "Ex. jeudi 7 novembre avant 16 h",
  },
  domainTerms: {
    label: "Domaine : extension, inclusion ou supplément validé",
    placeholder: "Ex. extension exacte et règle de coût approuvée",
    help: "Précisez si le domaine est inclus, payé en supplément ou apporté par le client.",
    multiline: true,
  },
  hostingTerms: {
    label: "Hébergement et durée validés",
    placeholder: "Ex. durée incluse et limites confirmées",
    help: "Indiquez clairement ce qui est inclus, pour combien de temps et les limites convenues.",
    multiline: true,
  },
  renewalTerms: {
    label: "Renouvellement et frais périodiques validés",
    placeholder: "Ex. échéance et montant confirmés, ou aucun renouvellement inclus",
    help: "Ne laissez pas une condition financière inconnue ou à confirmer.",
    multiline: true,
  },
};

export const salesScriptBlocks: SalesScriptBlock[] = [
  {
    id: "wa-inbound-first",
    title: "Réponse WhatsApp — nouveau lead entrant",
    trigger: "Le prospect a lui-même contacté Webora",
    channel: "WhatsApp",
    fields: ["contactName", "advisorName"],
    requiredFields: [],
    build: context =>
      `${greeting(context)} merci d’avoir contacté Webora. Je suis ${advisor(context)}. Pour vous orienter vers la formule la plus adaptée, pouvez-vous me dire en quelques mots votre activité et ce que vous aimeriez améliorer en priorité : présenter vos services, recevoir plus de demandes, vendre en ligne ou renforcer votre présence sur Google ?`,
  },
  {
    id: "wa-inbound-response",
    title: "WhatsApp — après la réponse du prospect",
    trigger: "Reformuler son besoin avant de recommander un pack",
    channel: "WhatsApp",
    fields: ["contactName", "objective", "confirmedProblem", "pack", "price", "relevantElements"],
    requiredFields: ["objective", "confirmedProblem", "pack", "price", "relevantElements"],
    build: context =>
      `${greeting(context)} si je comprends bien, votre priorité est ${context.objective}, et aujourd’hui le frein principal est ${context.confirmedProblem}. C’est bien cela ? Selon ce besoin, je regarderais plutôt ${context.pack} à ${context.price} DH, parce qu’il comprend ${context.relevantElements}.\n\nJe peux aussi vous préparer gratuitement une maquette de démonstration pour vous montrer une direction possible. Elle sert à visualiser le projet, sans engagement ; ce n’est pas le site complet prêt à publier.`,
  },
  {
    id: "wa-meeting",
    title: "WhatsApp — proposer un rendez-vous de 10 minutes",
    trigger: "Après avoir compris le besoin, fixer le prochain échange",
    channel: "WhatsApp",
    fields: ["contactName", "slot1", "slot2"],
    requiredFields: ["slot1", "slot2"],
    build: context =>
      `${greeting(context)} pour éviter de vous envoyer une proposition générique, je vous propose un échange de 10 minutes. Êtes-vous plus disponible ${context.slot1} ou ${context.slot2} ?`,
  },
  {
    id: "wa-mockup",
    title: "WhatsApp — présenter la maquette",
    trigger: "La maquette de démonstration est prête",
    channel: "WhatsApp",
    fields: ["contactName", "pageOrPath", "designChoice", "desiredAction"],
    requiredFields: ["pageOrPath", "designChoice", "desiredAction"],
    build: context =>
      `${greeting(context)} voici la maquette de démonstration préparée à partir de ${context.pageOrPath}. J’ai mis l’accent sur ${context.designChoice} afin de faciliter ${context.desiredAction}. Qu’est-ce qui vous convient le mieux ? Y a-t-il un élément important à ajuster avant que je vous recommande le périmètre final ?`,
  },
  {
    id: "wa-targeted",
    title: "WhatsApp — premier contact ciblé avec permission",
    trigger: "Prise de contact non sollicitée; expliquer honnêtement la source",
    channel: "WhatsApp",
    fields: ["contactName", "advisorName", "sourceContext", "observedItem"],
    requiredFields: ["advisorName", "sourceContext", "observedItem"],
    build: context =>
      `${greeting(context)} je suis ${context.advisorName} de Webora, une agence web basée à Casablanca. J’ai découvert ${context.company}${cityPhrase(context)} ${context.sourceContext}. J’ai une idée pour rendre ${context.observedItem} plus simple à présenter en ligne. Est-ce que je peux vous l’expliquer en deux phrases ici ? Si ce n’est pas le bon moment ou si vous ne souhaitez pas être recontacté, dites-le-moi et je m’arrête là.`,
  },
  {
    id: "email-targeted",
    title: "E-mail — prise de contact ciblée",
    trigger: "E-mail personnalisé après vérification du contexte et de l’observation",
    channel: "E-mail",
    fields: ["contactName", "advisorName", "activity", "sourceContext", "observedItem", "possibleImpact", "pack", "price", "relevantElements", "slot1"],
    requiredFields: ["advisorName", "sourceContext", "observedItem", "possibleImpact", "pack", "price", "relevantElements", "slot1"],
    build: context => {
      const subjectActivity = context.activity || context.company;
      return [
        `Objets possibles : « Une idée pour ${context.company} » · « Une piste pour ${context.company} — maquette gratuite » · « Votre présence en ligne pour ${subjectActivity} »`,
        `${greeting(context)}\n\nJe suis ${context.advisorName} de Webora, une agence web basée à Casablanca. J’ai découvert ${context.company}${cityPhrase(context)} ${context.sourceContext} et j’ai regardé ${context.observedItem}. Il me semble que cela pourrait compliquer ${context.possibleImpact} ; c’est une piste à confirmer avec vous.`,
        `Nous créons des sites adaptés au besoin : page dédiée à une offre, site vitrine, boutique ou projet plus complet avec SEO selon le pack. Pour votre situation, je regarderais d’abord ${context.pack} à ${context.price} DH, qui comprend ${context.relevantElements}.`,
        "Nous pouvons vous préparer une maquette de démonstration gratuite pour visualiser une piste avant de décider. Elle n’inclut pas la réalisation complète du site et ne vous engage pas.",
        `Seriez-vous disponible pour un échange de 10 minutes ${context.slot1} ? Si le sujet n’est pas pertinent, dites-le-moi et je ne vous relancerai pas.`,
        `Bien à vous,\n${context.advisorName} — Webora\nhttps://weboraagency.online`,
      ].join("\n\n");
    },
  },
  {
    id: "call-inbound",
    title: "Appel — prospect entrant",
    trigger: "Ouverture, découverte, reformulation, recommandation et clôture",
    channel: "Appel",
    fields: ["contactName", "advisorName", "requestTopic", "objective", "confirmedProblem", "priority", "pack", "price", "relevantElements", "slot1", "slot2"],
    requiredFields: ["advisorName", "requestTopic"],
    build: context => {
      const sections = [
        `OUVERTURE\n${greeting(context)} ${context.advisorName} de Webora à l’appareil. Vous nous avez contactés au sujet de ${context.requestTopic}. Est-ce que vous avez 5 à 10 minutes maintenant, ou préférez-vous fixer un autre moment ?`,
        "DÉCOUVERTE — choisissez quatre à six questions, puis laissez le prospect expliquer sa situation.\n• Quelle est votre activité et quel service ou produit voulez-vous mettre en avant en premier ?\n• Qui est votre client idéal et dans quelle ville ou zone le servez-vous ?\n• Comment les nouveaux clients vous découvrent-ils aujourd’hui ?\n• Que se passe-t-il entre le moment où une personne vous découvre et celui où elle vous contacte ou achète ?\n• Quelles questions vos clients posent-ils avant de passer à l’action ?\n• Quelle action voulez-vous faciliter : appel, WhatsApp, devis, réservation, achat ou visite ?",
      ];
      if (context.objective && context.confirmedProblem && context.priority) {
        sections.push(`REFORMULATION\nSi je résume, vous cherchez ${context.objective}, et aujourd’hui ${context.confirmedProblem} vous freine. Le plus important est donc ${context.priority}. Ai-je bien compris ?`);
      }
      if (context.pack && context.price && context.relevantElements) {
        sections.push(`RECOMMANDATION\nÀ partir de ce que vous m’avez dit, je vous recommande ${context.pack} à ${context.price} DH, car il prévoit ${context.relevantElements}. Je peux préparer une maquette gratuite ciblée sur la page ou le parcours qui répond à votre priorité.`);
      }
      if (context.slot1 && context.slot2) {
        sections.push(`CLÔTURE\nPour avancer sans engagement, je peux vous envoyer un récapitulatif et préparer la maquette convenue. Est-ce que ${context.slot1} ou ${context.slot2} vous arrange pour un échange de 10 minutes ?`);
      } else {
        sections.push("CLÔTURE\nConfirmez avec le prospect une prochaine action datée : envoi d’informations, appel de 10 minutes, validation du brief ou présentation de la maquette.");
      }
      return sections.join("\n\n");
    },
  },
  {
    id: "call-targeted",
    title: "Appel — premier contact ciblé",
    trigger: "Donner une raison précise et vraie, demander la permission de continuer",
    channel: "Appel",
    fields: ["contactName", "advisorName", "sourceContext", "observedItem"],
    requiredFields: ["advisorName", "sourceContext", "observedItem"],
    build: context =>
      `${greeting(context)} je suis ${context.advisorName} de Webora. Je vous appelle brièvement parce que ${context.sourceContext}. En regardant ${context.observedItem}, j’ai pensé qu’une piste pourrait vous être utile. Je ne veux pas vous retenir : avez-vous une minute pour que je vous explique pourquoi je vous contacte ?\n\nSI OUI\nExpliquez l’observation sans l’exagérer, puis demandez si la personne souhaite en parler davantage.\n\nSI NON\nBien sûr, je termine ici. Bonne journée. Je ne vous rappellerai pas.`,
  },
  {
    id: "followup-proposal",
    title: "Relance — après envoi d’une proposition",
    trigger: "Vérifier la réception et comprendre le point qui bloque, sans pression",
    channel: "WhatsApp",
    fields: ["contactName", "projectSummary", "blockingPoint"],
    requiredFields: ["projectSummary"],
    build: context =>
      `${greeting(context)} je reviens vers vous au sujet de ${context.projectSummary}. Avez-vous pu regarder le récapitulatif ou la maquette ? Si vous le souhaitez, dites-moi ce qui vous bloque aujourd’hui : le budget, le périmètre ou le calendrier. Je pourrai clarifier ce point sans vous pousser vers un pack qui ne vous convient pas.${context.blockingPoint ? `\n\nVous m’aviez indiqué que le point à éclaircir était : ${context.blockingPoint}. Est-ce toujours le cas ?` : ""}`,
  },
  {
    id: "followup-precision",
    title: "Relance — apporter une précision utile",
    trigger: "Répondre à une question ou à une hésitation précise",
    channel: "WhatsApp",
    fields: ["contactName", "objective", "projectSummary", "nextAction"],
    requiredFields: ["objective"],
    build: context =>
      `${greeting(context)} pour compléter notre échange, voici le point qui peut être utile pour ${context.objective}${context.projectSummary ? `, au sujet de ${context.projectSummary}` : ""}. ${context.nextAction ? `La prochaine étape que je vous propose est : ${context.nextAction}.` : "Si votre projet est toujours d’actualité, je peux vous proposer un prochain pas précis. Sinon, je peux clôturer le suivi."}`,
  },
  {
    id: "quiet-close",
    title: "Clôture après silence — sans demande d’arrêt",
    trigger: "Dernière clôture après relances espacées; ne pas utiliser après un refus",
    channel: "WhatsApp",
    fields: ["contactName"],
    requiredFields: [],
    build: context =>
      `${greeting(context)} je ne veux pas encombrer vos messages. Je clôture le suivi pour le moment. Si le projet redevient prioritaire, vous pourrez nous retrouver sur weboraagency.online ou me répondre ici. Bonne continuation.`,
  },
  {
    id: "next-step-close",
    title: "Conclure sur une prochaine étape datée",
    trigger: "Le prospect est intéressé; confirmer périmètre, éléments et date",
    channel: "WhatsApp",
    fields: ["contactName", "scope", "customerMaterials", "nextAction", "nextDate"],
    requiredFields: ["scope", "nextAction"],
    build: context =>
      `${greeting(context)} si le périmètre vous convient — ${context.scope} — la prochaine étape est ${context.nextAction}.${context.customerMaterials ? ` Pour avancer, il nous faudra ${context.customerMaterials}.` : ""}${context.nextDate ? ` Je vous propose de faire le point ${context.nextDate}.` : " Voulez-vous que je vous récapitule par écrit le prix, ce qui est inclus, les éléments à votre charge et le calendrier estimatif avant toute validation ?"}`,
  },
];

export const recommendedScriptForStatus: Record<string, string> = {
  "À contacter": "wa-targeted",
  "Contact initial": "wa-inbound-response",
  "En discussion": "followup-proposal",
  "Démo planifiée": "wa-mockup",
  "C'est OK": "next-step-close",
};

export const salesOffers = [
  {
    name: "Mono-produit",
    price: "599 DH",
    items: [
      "Landing page jusqu’à 7 sections",
      "Commandes par WhatsApp ou formulaire",
      "Hébergement 12 mois indiqué sur le site",
    ],
    note: "L’extension de domaine doit être clarifiée avant le devis.",
  },
  {
    name: "Essentiel",
    price: "999 DH",
    items: [
      "Site vitrine de 4 pages : Accueil, Services, Portfolio, Contact",
      "Boutons WhatsApp",
      "Hébergement 12 mois indiqué sur le site",
    ],
    note: "L’extension de domaine doit être clarifiée avant le devis.",
  },
  {
    name: "E-commerce",
    price: "2 999 DH",
    items: [
      "Jusqu’à 9 produits et panier intégré",
      "Paiement à la livraison",
      "Paiement : 50 % au départ et 50 % avant le lancement",
    ],
    note: "Confirmer par écrit le périmètre, le contenu et le calendrier.",
  },
  {
    name: "SEO Start",
    price: "3 999 DH",
    items: [
      "Jusqu’à 14 pages",
      "Optimisation SEO de base sur 5 pages",
      "Configuration de Google Search Console",
    ],
    note: "Aucun classement Google ni délai de résultat n’est garanti.",
  },
  {
    name: "Croissance",
    price: "7 999 DH",
    items: [
      "Jusqu’à 25 pages",
      "Analyse concurrentielle et tunnel de conversion",
      "Plan de contenu sur 90 jours",
    ],
    note: "Confirmer par écrit l’hébergement, sa durée et les conditions de domaine.",
  },
  {
    name: "Projet personnalisé",
    price: "Sur devis",
    items: [
      "Fonctionnalités et intégrations spécifiques",
      "Périmètre défini avec le client",
      "Prix, calendrier et exclusions détaillés au devis",
    ],
    note: "Faire vérifier tout besoin hors pack standard avant l’envoi du devis.",
  },
] as const;

export const salesOfferUseCases: Record<string, string> = {
  "Mono-produit": "À recommander pour lancer une offre principale ou un produit avec un parcours simple vers la commande.",
  Essentiel: "À recommander pour présenter clairement une activité, ses services, ses réalisations et ses coordonnées.",
  "E-commerce": "À recommander pour un catalogue de départ et des commandes en ligne structurées.",
  "SEO Start": "À recommander si les pages principales doivent être mieux structurées pour les moteurs de recherche.",
  Croissance: "À recommander pour travailler plus largement la visibilité, le parcours de conversion et le contenu.",
  "Projet personnalisé": "À recommander lorsque le besoin dépasse les packs standard ou nécessite des intégrations spécifiques.",
};

export const salesObjections = [
  {
    objection: "C’est trop cher.",
    response:
      "Je comprends. Pour votre situation, le point important est le budget total par rapport au résultat attendu. On peut commencer par le périmètre qui répond à votre priorité, par exemple le pack le plus pertinent plutôt que de payer des fonctionnalités inutiles.",
  },
  {
    objection: "Je n’ai pas besoin d’un site, j’ai Instagram.",
    response:
      "Instagram est utile pour publier et échanger. Un site peut le compléter en regroupant vos services, vos coordonnées et une action claire au même endroit. Aujourd’hui, est-ce que vos clients trouvent facilement les informations et le moyen de vous contacter ?",
  },
  {
    objection: "J’ai déjà un site.",
    response:
      "Très bien. Souhaitez-vous l’améliorer, par exemple sur l’affichage mobile, les demandes reçues, la présentation de vos offres ou le référencement ? Si votre site répond déjà à vos objectifs, il n’y a pas de raison de le refaire sans diagnostic.",
  },
  {
    objection: "Garantissez-vous la première page Google ?",
    response:
      "Non. Nous ne pouvons pas promettre une position que personne ne maîtrise seule. Nous pouvons détailler les éléments prévus dans le pack et ce qui sera réalisé; les résultats et le calendrier varient.",
  },
  {
    objection: "Combien de temps pour être premier sur Google ?",
    response:
      "Je ne peux pas garantir un délai ni une place. Cela dépend notamment du site, de la concurrence et des requêtes visées. Nous pouvons définir le périmètre SEO prévu et suivre les éléments disponibles.",
  },
  {
    objection: "Je veux seulement être sur Google Maps.",
    response:
      "On peut examiner si votre fiche d’établissement est éligible et si ses informations sont complètes et exactes. Google tient compte de la pertinence, de la distance et de la proéminence; la validation et le classement ne sont pas garantis.",
  },
  {
    objection: "Envoyez-moi vos prix.",
    response:
      "Bien sûr. Pour vous envoyer la formule et les options adaptées, dites-moi simplement si votre priorité est une page de présentation, un site vitrine, une boutique ou un besoin SEO. Je vous enverrai le tarif correspondant avec ce qu’il comprend.",
  },
  {
    objection: "Je vais réfléchir.",
    response:
      "Bien sûr. Qu’est-ce qui vous aiderait à décider : le périmètre, un exemple de maquette, les conditions du domaine ou le calendrier ? Souhaitez-vous que je revienne vers vous à une date précise, ou préférez-vous me recontacter ?",
  },
  {
    objection: "Je dois en parler à mon associé.",
    response:
      "Bien sûr. Je peux vous préparer un récapitulatif simple avec l’objectif, le pack conseillé, le prix et les points à valider. Si vous le souhaitez, nous pouvons aussi prévoir un court échange à trois.",
  },
  {
    objection: "Pourquoi la maquette est gratuite ? Où est le piège ?",
    response:
      "Il n’y a pas d’obligation d’achat. La maquette est une démonstration limitée pour valider une direction visuelle et un parcours à partir des informations partagées. Elle ne comprend pas la création complète du site ni sa mise en ligne.",
  },
  {
    objection: "Je veux que tout soit inclus.",
    response:
      "Je peux détailler par écrit le nombre de pages, les fonctionnalités, l’hébergement et sa durée, le domaine et son renouvellement, le SEO, le calendrier et le suivi. Si un élément n’est pas confirmé dans le devis, je préfère le vérifier avant de vous le promettre.",
  },
] as const;

export const salesConversationSteps = [
  "Créer un échange naturel : se présenter, demander si la personne a quelques minutes et accepter un refus sans insister.",
  "Comprendre l’activité : ce que l’entreprise vend, à qui elle s’adresse et comment les clients la trouvent.",
  "Faire préciser un problème concret ou un objectif exprimé, sans inventer une observation.",
  "Reformuler avec les mots du prospect et demander confirmation avant de proposer une solution.",
  "Proposer un premier pas adapté, avec une maquette de démonstration au périmètre clairement annoncé.",
  "Conclure sur une prochaine action datée, en confirmant qui fait quoi et quand.",
] as const;

export const salesQualificationQuestions = [
  "Quelle est votre activité et quel service ou produit voulez-vous mettre en avant en premier ?",
  "Qui est votre client idéal et dans quelle ville ou zone le servez-vous ?",
  "Comment les nouveaux clients vous découvrent-ils aujourd’hui : recommandations, Instagram, Google, publicité ou passage en boutique ?",
  "Que se passe-t-il entre le moment où une personne vous découvre et celui où elle vous contacte ou achète ?",
  "Quelles questions vos clients posent-ils souvent avant de passer à l’action ?",
  "Avez-vous déjà un site, un catalogue ou une fiche Google ? Qu’est-ce qui vous satisfait ou vous gêne ?",
  "Quelle action voulez-vous faciliter : appel, WhatsApp, demande de devis, réservation, achat ou visite en magasin ?",
  "Avez-vous une date cible ou un événement qui rend le lancement urgent ?",
  "Qui validera le contenu et le budget ? Avez-vous des textes, photos, un logo et des coordonnées à jour ?",
  "Avez-vous une fourchette de budget ou un pack en tête ?",
] as const;

export const salesObservationExamples = [
  {
    situation: "Les visiteurs ne savent pas quoi faire ensuite",
    observation: "Vérifier si l’appel, WhatsApp ou le formulaire est réellement difficile à repérer, notamment sur mobile.",
    piste: "Une page claire avec une action de contact visible peut réduire les étapes avant la prise de contact; demander d’abord si cette difficulté est ressentie.",
  },
  {
    situation: "L’offre est difficile à comprendre",
    observation: "Noter les services réellement proposés et ce qu’un nouveau visiteur devrait distinguer.",
    piste: "Une organisation par services, preuves et actions peut aider le visiteur à trouver l’offre adaptée sans prétendre que l’offre actuelle fait perdre des clients.",
  },
  {
    situation: "Les produits sont présentés uniquement sur les réseaux sociaux",
    observation: "Vérifier si les références, prix ou modalités de commande sont répartis entre plusieurs publications.",
    piste: "Un petit catalogue avec un parcours de commande peut aider à consulter les produits et commander au même endroit; confirmer le besoin avant de proposer l’E-commerce.",
  },
  {
    situation: "La présence locale manque d’informations",
    observation: "Vérifier l’éligibilité et l’exactitude des informations de la fiche d’établissement, sans supposer son classement.",
    piste: "Une fiche complète peut faciliter la découverte locale. Google cite la pertinence, la distance et la proéminence; aucune position précise n’est garantie.",
  },
  {
    situation: "Le site existe, mais sa visibilité est floue",
    observation: "Examiner les pages importantes et la structure SEO de base réellement présente.",
    piste: "SEO Start prévoit l’optimisation de base de 5 pages et Search Console; cela ne garantit ni classement ni délai.",
  },
] as const;

export const salesTeamRules = [
  "Le conseiller qui suit le prospect reste responsable du prochain pas et consigne le dernier échange, son canal, son résultat et l’échéance convenue.",
  "Avant chaque message, vérifier le nom, l’activité, le canal préféré, le problème réellement confirmé, le pack adapté et le prix.",
  "Ne pas envoyer automatiquement un premier message, une recommandation commerciale ou une relance sensible : le conseiller relit et valide chaque texte.",
  "Après une réponse du prospect, suspendre la relance prévue et ajuster le suivi à l’étape correspondant à sa réponse.",
  "Après un refus ou une demande de ne plus être contacté, arrêter les relances et le noter immédiatement.",
  "Cadence indicative, à adapter au canal et à la réponse : une relance après 2–3 jours ouvrés; une seconde environ une semaine plus tard uniquement si aucune demande d’arrêt; puis clôturer le suivi.",
  "Créer un prochain pas daté lorsque le conseiller promet un envoi, une maquette, un rappel ou un devis.",
  "Faire vérifier une extension, une intégration, un délai court ou une demande SEO qui sort du cadre standard avant d’envoyer le devis.",
  "Ne donnez pas de délai exact sans vérifier la charge, la disponibilité des contenus et les validations du client; confirmez le calendrier après le brief et le périmètre.",
  "Si vous annoncez un suivi illimité, faites valider et préciser par écrit son périmètre, sa durée, ses canaux, ses délais de réponse et ses exclusions. Distinguez l’assistance des nouvelles pages, fonctionnalités, contenus récurrents, hébergement et renouvellement de domaine.",
  "Ne commencez pas une maquette détaillée sans informations suffisantes ni périmètre gratuit validé avec le responsable commercial; convenez du livrable et de la date de présentation.",
  "Après la présentation de la maquette, expliquez quelques choix concrets, demandez les retours et confirmez le périmètre final avant le devis.",
] as const;

export const salesTeamDistribution = [
  "Conseiller responsable : suit le prospect assigné, garde un interlocuteur identifiable et consigne le prochain pas.",
  "Responsable commercial : maintient une règle commune sur les tarifs, le périmètre, le domaine, l’hébergement et le suivi annoncé.",
  "Référent devis : relit avant envoi toute extension, intégration, remise ou demande qui sort d’un pack standard.",
  "Relais d’équipe : peut reprendre le dossier en cas d’absence à partir des notes partagées, sans redemander tout le brief au prospect.",
] as const;

export const salesFollowupChecklist = [
  "Entreprise, interlocuteur, rôle, canal préféré et date du dernier échange.",
  "Activité, ville/zone, cible et objectif exprimé par le prospect.",
  "Problème confirmé, observation vérifiée et impact mentionné par le prospect.",
  "Site, réseaux ou fiche Google existants; liens vérifiés et éléments manquants.",
  "Pack recommandé, raison du choix, prix communiqué et options à clarifier.",
  "État de la maquette : demandée, brief complet, en préparation, présentée ou retours reçus.",
  "Points à confirmer avant une promesse : domaine, hébergement, durée, calendrier, suivi, contenu et paiement.",
  "Prochaine action, conseiller responsable et date convenue; noter immédiatement toute demande d’arrêt.",
] as const;

export const salesManagerIndicators = [
  "Nouveaux leads et délai de première réponse.",
  "Prospects qualifiés et fiches sans prochaine action datée.",
  "Maquettes demandées, présentées et retours reçus.",
  "Devis envoyés, ventes gagnées/perdues et motifs de refus.",
] as const;

export const salesPlaybookSources = [
  {
    label: "Offres, tarifs et réponses Webora",
    url: "https://weboraagency.online",
  },
  {
    label: "Google Search Central — choisir un spécialiste SEO",
    url: "https://developers.google.com/search/docs/fundamentals/do-i-need-seo",
  },
  {
    label: "Google Business Profile — classement local",
    url: "https://support.google.com/business/answer/7091?hl=fr",
  },
] as const;

export const domainPricingWarning =
  "À valider avant devis : le playbook indique que la page publique présente un .COM inclus sur le pack 599 DH; pour le pack 999 DH, elle parle seulement d’un domaine inclus sans préciser l’extension. La règle interne prévoit pourtant +300 DH/an pour un domaine .COM, .NET ou .MA sur les deux packs. Confirmez la règle applicable avec l’équipe avant de chiffrer. Pour les packs supérieurs, confirmez aussi par écrit le domaine, l’hébergement, sa durée et le renouvellement.";

export const mockupScopeNote =
  "La maquette gratuite est une démonstration limitée d’une direction visuelle ou d’une première page, fondée sur les informations déjà partagées. Elle nécessite l’accord du prospect et ne signifie pas que le site complet est fonctionnel, développé ou mis en ligne. Elle ne comprend pas l’accès aux fichiers finaux ni des révisions illimitées, sauf décision écrite contraire de Webora.";
