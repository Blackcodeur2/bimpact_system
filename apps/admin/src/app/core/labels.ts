export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

export interface StatusLabel {
  label: string;
  tone: Tone;
}

const s = (label: string, tone: Tone): StatusLabel => ({ label, tone });

/** Libellés et couleurs des statuts, par domaine. */
export const STATUS_LABELS = {
  user: {
    PENDING_VERIFICATION: s('Inscription en cours', 'neutral'),
    ACTIVE: s('Actif', 'success'),
    SUSPENDED: s('Suspendu', 'danger'),
    LOCKED: s('Verrouillé', 'warning'),
    CLOSED: s('Fermé', 'neutral'),
  },
  kyc: {
    NOT_STARTED: s('Non commencé', 'neutral'),
    DRAFT: s('Brouillon', 'neutral'),
    SUBMITTED: s('À examiner', 'info'),
    UNDER_REVIEW: s('En revue', 'accent'),
    APPROVED: s('Vérifié', 'success'),
    REJECTED: s('Refusé', 'danger'),
  },
  kycDocument: {
    PENDING: s('À contrôler', 'info'),
    ACCEPTED: s('Accepté', 'success'),
    REJECTED: s('Refusé', 'danger'),
    REPLACED: s('Remplacé', 'neutral'),
  },
  payment: {
    CREATED: s('Créé', 'neutral'),
    PENDING: s('En attente opérateur', 'warning'),
    SUCCEEDED: s('Confirmé', 'success'),
    FAILED: s('Échoué', 'danger'),
    CANCELLED: s('Annulé', 'neutral'),
    EXPIRED: s('Expiré', 'neutral'),
  },
  draw: {
    DRAFT: s('En préparation', 'neutral'),
    FROZEN: s('Liste figée', 'info'),
    EXECUTED: s('Exécuté (confidentiel)', 'accent'),
    PUBLISHED: s('Publié', 'success'),
    CANCELLED: s('Annulé', 'neutral'),
  },
  beneficiary: {
    SELECTED: s('Sélectionné', 'info'),
    TRAINING: s('En formation', 'accent'),
    CERTIFIED: s('Certifié', 'success'),
    ENTREPRENEUR: s('Entrepreneur', 'success'),
    WITHDRAWN: s('Retiré', 'neutral'),
  },
  project: {
    DRAFT: s('Brouillon', 'neutral'),
    SUBMITTED: s('Soumis', 'info'),
    UNDER_REVIEW: s('En examen', 'accent'),
    CHANGES_REQUESTED: s('Corrections demandées', 'warning'),
    APPROVED: s('Approuvé', 'success'),
    REJECTED: s('Refusé', 'danger'),
    FUNDED: s('Financé', 'success'),
    ACTIVE: s('En activité', 'success'),
    COMPLETED: s('Terminé', 'neutral'),
  },
  accident: {
    SUBMITTED: s('Déclaré', 'info'),
    DOCUMENTS_PENDING: s('Pièces demandées', 'warning'),
    INVESTIGATING: s('En instruction', 'accent'),
    APPROVED: s('Aide accordée', 'success'),
    REJECTED: s('Refusé', 'danger'),
    DISBURSED: s('Aide versée', 'success'),
    CLOSED: s('Clôturé', 'neutral'),
  },
  severity: {
    LIGHT: s('Léger', 'info'),
    MODERATE: s('Modéré', 'warning'),
    SEVERE: s('Grave', 'danger'),
  },
  company: {
    ACTIVE: s('Active', 'success'),
    SUSPENDED: s('Suspendue', 'danger'),
    CLOSED: s('Fermée', 'neutral'),
  },
  application: {
    PENDING: s('Reçue', 'info'),
    SHORTLISTED: s('Présélectionnée', 'accent'),
    CONTACTED: s('Contact pris', 'accent'),
    HIRED: s('Retenue', 'success'),
    REJECTED: s('Non retenue', 'danger'),
    WITHDRAWN: s('Retirée', 'neutral'),
  },
  ticket: {
    OPEN: s('À traiter', 'warning'),
    PENDING: s('Attente du membre', 'info'),
    RESOLVED: s('Résolu', 'success'),
    CLOSED: s('Clôturé', 'neutral'),
  },
  risk: {
    NEW: s('Nouveau', 'warning'),
    INVESTIGATING: s('En enquête', 'info'),
    ESCALATED: s('Escaladé', 'danger'),
    RESOLVED: s('Résolu', 'success'),
    FALSE_POSITIVE: s('Faux positif', 'neutral'),
  },
  course: {
    DRAFT: s('Brouillon', 'neutral'),
    PUBLISHED: s('Publié', 'success'),
    ARCHIVED: s('Archivé', 'neutral'),
  },
  plan: {
    ACTIVE: s('Active', 'success'),
    PAUSED: s('En pause', 'warning'),
  },
  solidarity: {
    ACTIVE: s('Adhérent', 'success'),
    LEFT: s('Retiré', 'neutral'),
  },
  check: {
    OK: s('Conforme', 'success'),
    EXCEPTION: s('Anomalie', 'danger'),
    BALANCED: s('Équilibré', 'success'),
    EXCEPTIONS: s('Anomalies', 'danger'),
  },
} satisfies Record<string, Record<string, StatusLabel>>;

export type StatusDomain = keyof typeof STATUS_LABELS;

export function statusLabel(domain: StatusDomain, code: string | null | undefined): StatusLabel {
  if (!code) return s('—', 'neutral');
  return (STATUS_LABELS[domain] as Record<string, StatusLabel>)[code] ?? s(humanize(code), 'neutral');
}

/** Options de filtre d'un domaine de statuts. */
export function statusOptions(domain: StatusDomain): { value: string; label: string }[] {
  return Object.entries(STATUS_LABELS[domain] as Record<string, StatusLabel>).map(([value, item]) => ({ value, label: item.label }));
}

export function dictionaryOptions(dictionary: Record<string, string>): { value: string; label: string }[] {
  return Object.entries(dictionary).map(([value, label]) => ({ value, label }));
}

export const RISK_ACTION_LABELS: Record<string, string> = {
  NOTE: 'Ajouter une note',
  ASSIGN_SELF: 'Me l’attribuer',
  INVESTIGATE: 'Ouvrir l’enquête',
  ESCALATE: 'Escalader',
  RESOLVE: 'Résoudre',
  FALSE_POSITIVE: 'Classer en faux positif',
};

export const RISK_EVENT_LABELS: Record<string, string> = {
  OPENED: 'Dossier ouvert',
  STATUS_CHANGED: 'Changement de statut',
  ASSIGNED: 'Attribution',
  NOTE: 'Note',
};

export const KYC_DECISION_LABELS: Record<string, string> = {
  APPROVED: 'Identité approuvée',
  REJECTED: 'Dossier refusé',
  MORE_INFO_REQUESTED: 'Complément demandé',
};

export const PROJECT_DECISION_LABELS: Record<string, string> = {
  APPROVED: 'Approuver le projet',
  CHANGES_REQUESTED: 'Demander des corrections',
  REJECTED: 'Refuser le projet',
};

export const ACTOR_TYPE_LABELS: Record<string, string> = {
  MEMBER: 'Membre',
  STAFF: 'Agent',
  SYSTEM: 'Système',
};

export const LEDGER_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'Rechargement',
  CONTRIBUTION: 'Contribution',
  SOLIDARITY_CONTRIBUTION: 'Participation solidaire',
  SOLIDARITY_ASSISTANCE: 'Aide solidaire',
  REVERSAL: 'Contre-passation',
  ADJUSTMENT: 'Ajustement',
  FEE: 'Frais',
  WITHDRAWAL: 'Retrait',
};

export const SCAN_STATUS_LABELS: Record<string, string> = {
  CLEAN: 'Sain',
  PENDING: 'Analyse en attente',
  INFECTED: 'Menace détectée',
  SKIPPED: 'Non analysé',
  NOT_SCANNED: 'Non analysé',
  FAILED: 'Analyse en échec',
};

export const CHANNEL_LABELS: Record<string, string> = {
  MTN_MOMO: 'MTN Mobile Money',
  ORANGE_MONEY: 'Orange Money',
};

export const KYC_DOCUMENT_LABELS: Record<string, string> = {
  ID_FRONT: 'Pièce d’identité (recto)',
  ID_BACK: 'Pièce d’identité (verso)',
  SELFIE: 'Selfie',
  VEHICLE_REGISTRATION: 'Carte grise',
  DRIVING_LICENSE: 'Permis de conduire',
};

export const KYC_ID_TYPES: Record<string, string> = {
  CNI: 'Carte nationale d’identité',
  PASSPORT: 'Passeport',
  RECEIPT: 'Récépissé de CNI',
};

export const KYC_REQUIREMENT_LABELS: Record<string, string> = {
  IDENTITY: 'Identité incomplète',
  LOCATION: 'Adresse incomplète',
  VEHICLE: 'Véhicule incomplet',
};

export const VEHICLE_OWNERSHIP: Record<string, string> = {
  OWNER: 'Propriétaire',
  RENTED: 'Location',
  THIRD_PARTY: 'Appartient à un tiers',
};

export const RISK_FLAG_LABELS: Record<string, string> = {
  DUPLICATE_ID_NUMBER: 'Numéro de pièce déjà utilisé',
  NAME_MISMATCH: 'Nom différent du compte',
  DOCUMENTS_NOT_SCANNED: 'Documents non analysés par l’antivirus',
};

export const ACCIDENT_DOCUMENT_LABELS: Record<string, string> = {
  BULLETIN_ENTREE: 'Bulletin d’entrée',
  ORDONNANCE: 'Ordonnance',
  FACTURE_HOPITAL: 'Facture d’hôpital',
  CONSTAT_POLICE: 'Constat de police',
  PHOTO_MOTO: 'Photo de la moto',
  AUTRE: 'Autre justificatif',
};

export const PROJECT_DOCUMENT_LABELS: Record<string, string> = {
  BUSINESS_PLAN: 'Plan d’affaires',
  QUOTE: 'Devis',
  PHOTO: 'Photo',
  OTHER: 'Autre document',
};

export const SUPPORT_CATEGORIES: Record<string, string> = {
  ACCOUNT: 'Compte',
  PAYMENT: 'Paiement',
  CONTRIBUTION: 'Contribution',
  DRAW: 'Tirage',
  TRAINING: 'Formation',
  PROJECT: 'Projet',
  ACCIDENT: 'Accident',
  OTHER: 'Autre',
};

export const SIGNAL_LABELS: Record<string, string> = {
  SHARED_DEVICE: 'Appareil partagé',
  DUPLICATE_ID_DOCUMENT: 'Pièce d’identité réutilisée',
  REPEATED_LOCKOUTS: 'Verrouillages répétés',
  PAYMENT_FAILURES: 'Échecs de paiement répétés',
  MANUAL: 'Signalement manuel',
};

export const CONTRIBUTION_SOURCES: Record<string, string> = {
  MANUAL: 'Paiement manuel',
  AUTO: 'Prélèvement automatique',
};

export const LESSON_CONTENT_TYPES: Record<string, string> = {
  TEXT: 'Texte',
  AUDIO: 'Audio',
  VIDEO: 'Vidéo',
};

/** Actions du journal d'audit les plus fréquentes, en langage clair. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.register.completed': 'Inscription validée',
  'auth.login.succeeded': 'Connexion à l’application',
  'auth.login.failed': 'Échec de connexion',
  'auth.login.locked': 'Compte verrouillé après échecs',
  'auth.staff_login.succeeded': 'Connexion au back-office',
  'auth.staff_login.failed': 'Échec de connexion au back-office',
  'auth.staff_login.locked': 'Compte interne verrouillé',
  'auth.staff_password.changed': 'Mot de passe modifié',
  'auth.pin_reset.completed': 'Code PIN réinitialisé',
  'auth.refresh.reuse_detected': 'Réutilisation de session détectée',
  'auth.logout': 'Déconnexion',
  'wallet.opened': 'Portefeuille ouvert',
  'payment.intent.created': 'Rechargement initié',
  'payment.succeeded': 'Rechargement confirmé',
  'payment.succeeded.late': 'Rechargement confirmé tardivement',
  'payment.failed': 'Rechargement échoué',
  'payment.intent.expired': 'Rechargement expiré',
  'payment.intent.cancelled': 'Rechargement annulé',
  'payment.intent.refreshed': 'Paiement réinterrogé auprès de l’opérateur',
  'contribution.paid': 'Contribution payée',
  'contribution.settings.updated': 'Réglage de contribution modifié',
  'kyc.submitted': 'Dossier d’identité soumis',
  'kyc.review.claimed': 'Dossier d’identité pris en charge',
  'kyc.review.decided': 'Décision sur un dossier d’identité',
  'kyc.dossier.viewed': 'Dossier d’identité consulté',
  'draw.created': 'Tirage créé',
  'draw.frozen': 'Liste d’un tirage figée',
  'draw.executed': 'Tirage exécuté',
  'draw.published': 'Résultats de tirage publiés',
  'draw.cancelled': 'Tirage annulé',
  'beneficiary.updated': 'Parcours bénéficiaire modifié',
  'beneficiary.status.changed': 'Étape bénéficiaire franchie',
  'training.certificate.issued': 'Certificat délivré',
  'training.certificate.revoked': 'Certificat révoqué',
  'training.module.created': 'Module de formation créé',
  'training.module.updated': 'Module de formation modifié',
  'training.module.published': 'Module de formation publié',
  'training.module.archived': 'Module de formation archivé',
  'training.module.draft': 'Module repassé en brouillon',
  'training.lesson.created': 'Leçon ajoutée',
  'training.lesson.updated': 'Leçon modifiée',
  'training.lesson.deleted': 'Leçon supprimée',
  'training.quiz.saved': 'Quiz enregistré',
  'project.created': 'Projet créé',
  'project.submitted': 'Projet soumis',
  'project.review.started': 'Examen de projet commencé',
  'project.decided': 'Décision sur un projet',
  'company.created': 'Entreprise créée',
  'company.status.changed': 'Statut d’entreprise modifié',
  'job_offer.published': 'Offre d’emploi publiée',
  'job_offer.closed': 'Offre d’emploi fermée',
  'job_offer.moderated': 'Offre d’emploi fermée par l’équipe',
  'job_application.status_changed': 'Candidature mise à jour',
  'accident.reported': 'Accident déclaré',
  'accident.documents_requested': 'Justificatifs demandés',
  'accident.investigation_started': 'Instruction d’accident commencée',
  'accident.approved': 'Aide accident accordée',
  'accident.rejected': 'Dossier accident refusé',
  'accident.disbursement': 'Versement solidaire',
  'accident.closed': 'Dossier accident clôturé',
  'solidarity.joined': 'Adhésion au fonds de solidarité',
  'solidarity.left': 'Retrait du fonds de solidarité',
  'support.ticket.created': 'Demande de support créée',
  'support.ticket.staff_reply': 'Réponse du support',
  'support.ticket.status_changed': 'Statut de demande modifié',
  'settings.updated': 'Paramètre modifié',
  'staff.created': 'Compte interne créé',
  'staff.updated': 'Compte interne modifié',
  'staff.password.reset': 'Mot de passe interne réinitialisé',
  'staff.unlocked': 'Compte interne déverrouillé',
  'staff.sessions.revoked': 'Sessions internes fermées',
  'member.viewed': 'Fiche conducteur consultée',
  'member.status.changed': 'Statut de conducteur modifié',
  'member.unlocked': 'Conducteur déverrouillé',
  'member.note.added': 'Note interne ajoutée',
  'finance.reconciliation.run': 'Réconciliation lancée',
  'risk.case.opened': 'Dossier de risque ouvert',
  'report.generated': 'Rapport généré',
  'risk.case.note': 'Note sur un dossier de risque',
  'risk.case.assign_self': 'Dossier de risque attribué',
  'risk.case.investigate': 'Enquête de risque ouverte',
  'risk.case.escalate': 'Dossier de risque escaladé',
  'risk.case.resolve': 'Dossier de risque résolu',
  'risk.case.false_positive': 'Dossier de risque classé faux positif',
  'accident.claim.viewed': 'Dossier accident consulté',
  'accident.document.uploaded': 'Justificatif d’accident ajouté',
  'accident.message.added': 'Message sur un dossier accident',
  'project.updated': 'Projet modifié',
  'project.document.uploaded': 'Document de projet ajouté',
  'support.ticket.member_message': 'Message du membre au support',
  'support.ticket.closed': 'Demande de support clôturée',
  'solidarity.rules.accepted': 'Nouveau règlement de solidarité accepté',
  'ledger.transaction.posted': 'Écriture comptable',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? humanize(action);
}

function humanize(code: string): string {
  const text = code.replace(/[._]/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
