import type { IconName } from '../shared/icon.component';

export interface NavItem {
  label: string;
  route: string;
  icon: IconName;
  /** Au moins une de ces permissions est nécessaire. */
  permissions: readonly string[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Menu du back-office : chaque entrée n'apparaît qu'aux agents autorisés (le serveur reste seul juge). */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Pilotage',
    items: [
      { label: 'Tableau de bord', route: '/tableau-de-bord', icon: 'dashboard', permissions: ['admin.dashboard.read'] },
      { label: 'Rapports', route: '/rapports', icon: 'report', permissions: ['admin.reports.generate'] },
    ],
  },
  {
    title: 'Membres',
    items: [
      { label: 'Conducteurs', route: '/conducteurs', icon: 'users', permissions: ['admin.drivers.read'] },
      { label: 'Vérification d’identité', route: '/kyc', icon: 'id', permissions: ['admin.kyc.read'] },
      { label: 'Support', route: '/support', icon: 'support', permissions: ['admin.support.manage'] },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Finance & ledger', route: '/finance', icon: 'ledger', permissions: ['admin.finance.ledger.read'] },
      { label: 'Paiements', route: '/paiements', icon: 'card', permissions: ['admin.payments.read'] },
      { label: 'Contributions', route: '/contributions', icon: 'coins', permissions: ['admin.contributions.read'] },
    ],
  },
  {
    title: 'Programme',
    items: [
      { label: 'Tirages', route: '/tirages', icon: 'draw', permissions: ['admin.draws.manage'] },
      { label: 'Bénéficiaires', route: '/beneficiaires', icon: 'star', permissions: ['admin.beneficiaries.read'] },
      { label: 'Formation', route: '/formation', icon: 'book', permissions: ['admin.training.manage'] },
      { label: 'Projets', route: '/projets', icon: 'project', permissions: ['admin.projects.read'] },
      { label: 'Entreprises', route: '/entreprises', icon: 'building', permissions: ['admin.companies.read'] },
      { label: 'Recrutement', route: '/recrutement', icon: 'briefcase', permissions: ['admin.recruitment.read'] },
    ],
  },
  {
    title: 'Solidarité',
    items: [{ label: 'Accidents & solidarité', route: '/accidents', icon: 'shield', permissions: ['admin.accidents.read'] }],
  },
  {
    title: 'Conformité',
    items: [
      { label: 'Fraude & risque', route: '/risque', icon: 'alert', permissions: ['admin.fraud.read'] },
      { label: 'Journal d’audit', route: '/audit', icon: 'history', permissions: ['admin.audit.read'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Utilisateurs & rôles', route: '/utilisateurs', icon: 'key', permissions: ['admin.users.manage'] },
      { label: 'Paramètres', route: '/parametres', icon: 'settings', permissions: ['admin.settings.manage'] },
    ],
  },
];

/** Première page accessible, pour l'accueil d'un agent selon ses permissions. */
export function firstAllowedRoute(canAny: (permissions: readonly string[]) => boolean): string {
  for (const section of NAV_SECTIONS) {
    const item = section.items.find((entry) => canAny(entry.permissions));
    if (item) return item.route;
  }
  return '/compte';
}
