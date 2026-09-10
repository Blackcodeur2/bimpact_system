/**
 * Catalogue RBAC — source unique utilisée par le seed et les tests.
 * Les permissions sont des capacités fines ; les rôles ne sont que des regroupements.
 */
export const PERMISSIONS = {
  // Membre (application mobile)
  'me.read': 'Consulter son profil',
  'me.update': 'Modifier son profil',
  'dashboard.read.self': 'Consulter son tableau de bord',
  'wallet.read.self': 'Consulter son portefeuille et son historique',
  'kyc.read.self': 'Consulter son dossier de vérification d’identité',
  'kyc.write.self': 'Compléter et soumettre son dossier de vérification d’identité',
  'payments.read.self': 'Consulter ses paiements',
  'payments.create.self': 'Recharger son portefeuille',
  'notifications.read.self': 'Consulter et marquer ses notifications',
  'contributions.read.self': 'Consulter sa contribution et son calendrier',
  'contributions.pay.self': 'Payer sa contribution et régler le prélèvement automatique',
  'draws.read.self': 'Consulter les tirages, son éligibilité et ses résultats',
  'program.read.self': 'Suivre son parcours dans le programme',

  // Back-office
  'admin.dashboard.read': 'Tableau de bord administrateur',
  'admin.drivers.read': 'Consulter les conducteurs',
  'admin.drivers.update_status': 'Suspendre / réactiver un conducteur',
  'admin.kyc.read': 'Consulter la file KYC',
  'admin.kyc.decide': 'Décider d’un dossier KYC',
  'admin.finance.ledger.read': 'Consulter le ledger',
  'admin.finance.reconcile': 'Lancer une réconciliation',
  'admin.payments.read': 'Consulter les paiements',
  'admin.payments.reconcile': 'Réconcilier un paiement',
  'admin.contributions.read': 'Superviser les contributions',
  'admin.draws.manage': 'Configurer les tirages',
  'admin.draws.execute': 'Exécuter un tirage',
  'admin.draws.publish': 'Publier les résultats d’un tirage',
  'admin.beneficiaries.read': 'Suivre les bénéficiaires',
  'admin.beneficiaries.manage': 'Faire évoluer le parcours d’un bénéficiaire (statut, mentor)',
  'admin.training.manage': 'Administrer la formation',
  'admin.projects.read': 'Consulter les projets',
  'admin.projects.decide': 'Décider d’un projet',
  'admin.companies.read': 'Superviser les entreprises',
  'admin.recruitment.read': 'Superviser le recrutement',
  'admin.accidents.read': 'Consulter les accidents',
  'admin.accidents.decide': 'Décider d’un dossier accident',
  'admin.fraud.read': 'Consulter les alertes fraude',
  'admin.fraud.act': 'Traiter un dossier fraude',
  'admin.reports.generate': 'Générer des rapports',
  'admin.users.manage': 'Gérer les comptes internes et les rôles',
  'admin.settings.manage': 'Modifier les paramètres',
  'admin.audit.read': 'Consulter les journaux d’audit',
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as PermissionCode[];
const ADMIN_ALL = ALL.filter((p) => p.startsWith('admin.'));

export const ROLES: Record<string, { name: string; permissions: PermissionCode[] }> = {
  MEMBER: {
    name: 'Membre',
    permissions: [
      'me.read',
      'me.update',
      'dashboard.read.self',
      'wallet.read.self',
      'kyc.read.self',
      'kyc.write.self',
      'payments.read.self',
      'payments.create.self',
      'notifications.read.self',
      'contributions.read.self',
      'contributions.pay.self',
      'draws.read.self',
      'program.read.self',
    ],
  },
  SUPER_ADMIN: { name: 'Super administrateur', permissions: ADMIN_ALL },
  ADMIN: {
    name: 'Administrateur',
    permissions: ADMIN_ALL.filter((p) => p !== 'admin.users.manage' && p !== 'admin.settings.manage'),
  },
  FINANCE: {
    name: 'Finance',
    permissions: [
      'admin.dashboard.read',
      'admin.finance.ledger.read',
      'admin.finance.reconcile',
      'admin.payments.read',
      'admin.payments.reconcile',
      'admin.contributions.read',
      'admin.projects.read',
      'admin.reports.generate',
    ],
  },
  OPS: {
    name: 'Opérations',
    permissions: [
      'admin.dashboard.read',
      'admin.drivers.read',
      'admin.drivers.update_status',
      'admin.payments.read',
      'admin.contributions.read',
      'admin.beneficiaries.read',
      'admin.projects.read',
      'admin.companies.read',
      'admin.recruitment.read',
      'admin.accidents.read',
    ],
  },
  COMPLIANCE: {
    name: 'Conformité',
    permissions: [
      'admin.drivers.read',
      'admin.kyc.read',
      'admin.kyc.decide',
      'admin.draws.manage',
      'admin.draws.execute',
      'admin.draws.publish',
      'admin.accidents.read',
      'admin.fraud.read',
      'admin.audit.read',
    ],
  },
  PROGRAM: {
    name: 'Programme',
    permissions: [
      'admin.dashboard.read',
      'admin.beneficiaries.read',
      'admin.beneficiaries.manage',
      'admin.training.manage',
      'admin.projects.read',
      'admin.projects.decide',
      'admin.companies.read',
      'admin.reports.generate',
    ],
  },
  RISK: {
    name: 'Risque',
    permissions: ['admin.drivers.read', 'admin.fraud.read', 'admin.fraud.act', 'admin.audit.read'],
  },
  CLAIMS: {
    name: 'Sinistres / solidarité',
    permissions: ['admin.drivers.read', 'admin.accidents.read', 'admin.accidents.decide'],
  },
};

/** Comptes système du ledger, créés par le seed. */
export const SYSTEM_LEDGER_ACCOUNTS = [
  {
    code: 'system:provider_clearing:sandbox',
    name: 'Compte de compensation — fournisseur sandbox',
    type: 'ASSET',
    purpose: 'PROVIDER_CLEARING',
    allowNegative: false,
  },
  {
    code: 'system:contribution_pool',
    name: 'Fonds des contributions',
    type: 'LIABILITY',
    purpose: 'CONTRIBUTION_POOL',
    allowNegative: false,
  },
  {
    code: 'system:fees_revenue',
    name: 'Produits — frais',
    type: 'REVENUE',
    purpose: 'FEES_REVENUE',
    allowNegative: false,
  },
  {
    code: 'system:adjustments',
    name: 'Ajustements contrôlés',
    type: 'EQUITY',
    purpose: 'ADJUSTMENTS',
    allowNegative: true,
  },
  {
    code: 'system:solidarity_pool',
    name: 'Pool Solidarité Accidents',
    type: 'ASSET',
    purpose: 'SOLIDARITY_POOL',
    allowNegative: false,
  },
] as const;
