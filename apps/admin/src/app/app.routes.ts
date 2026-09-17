import { Route, Routes } from '@angular/router';
import { authGuard, guestGuard, homeRedirectGuard, permissionGuard, sessionGuard } from './core/auth/guards';
import { ShellComponent } from './layout/shell.component';

type Loader = NonNullable<Route['loadComponent']>;

/** Page protégée : au moins une des permissions est requise (le serveur contrôle à nouveau chaque appel). */
function page(path: string, title: string, permissions: string[], loadComponent: Loader): Route {
  return { path, title, loadComponent, canActivate: [permissionGuard], data: { permissions } };
}

export const routes: Routes = [
  {
    path: 'login',
    title: 'Connexion',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'compte/mot-de-passe',
    title: 'Mot de passe',
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/auth/change-password.page').then((m) => m.ChangePasswordPage),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      { path: '', pathMatch: 'full', canActivate: [homeRedirectGuard], children: [] },
      page('tableau-de-bord', 'Tableau de bord', ['admin.dashboard.read'], () =>
        import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      ),
      page('rapports', 'Rapports', ['admin.reports.generate'], () => import('./features/reports/reports.page').then((m) => m.ReportsPage)),

      page('conducteurs', 'Conducteurs', ['admin.drivers.read'], () => import('./features/drivers/drivers.page').then((m) => m.DriversPage)),
      page('conducteurs/:id', 'Fiche conducteur', ['admin.drivers.read'], () =>
        import('./features/drivers/driver-detail.page').then((m) => m.DriverDetailPage),
      ),
      page('kyc', 'Vérification d’identité', ['admin.kyc.read'], () => import('./features/kyc/kyc-queue.page').then((m) => m.KycQueuePage)),
      page('kyc/:id', 'Dossier d’identité', ['admin.kyc.read'], () => import('./features/kyc/kyc-dossier.page').then((m) => m.KycDossierPage)),
      page('support', 'Support', ['admin.support.manage'], () => import('./features/support/support.pages').then((m) => m.SupportTicketsPage)),
      page('support/:id', 'Demande de support', ['admin.support.manage'], () =>
        import('./features/support/support.pages').then((m) => m.SupportTicketPage),
      ),

      page('finance', 'Finance & ledger', ['admin.finance.ledger.read'], () => import('./features/finance/finance.page').then((m) => m.FinancePage)),
      page('paiements', 'Paiements', ['admin.payments.read'], () => import('./features/payments/payments.pages').then((m) => m.PaymentsPage)),
      page('paiements/:id', 'Paiement', ['admin.payments.read'], () =>
        import('./features/payments/payments.pages').then((m) => m.PaymentDetailPage),
      ),
      page('contributions', 'Contributions', ['admin.contributions.read'], () =>
        import('./features/contributions/contributions.page').then((m) => m.ContributionsPage),
      ),

      page('tirages', 'Tirages', ['admin.draws.manage'], () => import('./features/draws/draws.pages').then((m) => m.DrawsPage)),
      page('tirages/:id', 'Tirage', ['admin.draws.manage'], () => import('./features/draws/draws.pages').then((m) => m.DrawDetailPage)),
      page('beneficiaires', 'Bénéficiaires', ['admin.beneficiaries.read'], () =>
        import('./features/beneficiaries/beneficiaries.page').then((m) => m.BeneficiariesPage),
      ),
      page('formation', 'Formation', ['admin.training.manage'], () => import('./features/training/training.pages').then((m) => m.TrainingPage)),
      page('formation/modules/:id', 'Module de formation', ['admin.training.manage'], () =>
        import('./features/training/training.pages').then((m) => m.TrainingModulePage),
      ),
      page('projets', 'Projets', ['admin.projects.read'], () => import('./features/projects/projects.pages').then((m) => m.ProjectsPage)),
      page('projets/:id', 'Projet', ['admin.projects.read'], () => import('./features/projects/projects.pages').then((m) => m.ProjectDetailPage)),
      page('entreprises', 'Entreprises', ['admin.companies.read'], () =>
        import('./features/companies/companies.pages').then((m) => m.CompaniesPage),
      ),
      page('entreprises/:id', 'Entreprise', ['admin.companies.read'], () =>
        import('./features/companies/companies.pages').then((m) => m.CompanyDetailPage),
      ),
      page('recrutement', 'Recrutement', ['admin.recruitment.read'], () =>
        import('./features/recruitment/recruitment.pages').then((m) => m.RecruitmentPage),
      ),
      page('recrutement/:id', 'Offre d’emploi', ['admin.recruitment.read'], () =>
        import('./features/recruitment/recruitment.pages').then((m) => m.JobApplicationsPage),
      ),
      page('accidents', 'Accidents & solidarité', ['admin.accidents.read'], () =>
        import('./features/accidents/accidents.pages').then((m) => m.AccidentsPage),
      ),
      page('accidents/:id', 'Dossier accident', ['admin.accidents.read'], () =>
        import('./features/accidents/accidents.pages').then((m) => m.AccidentDetailPage),
      ),

      page('risque', 'Fraude & risque', ['admin.fraud.read'], () => import('./features/risk/risk.pages').then((m) => m.RiskPage)),
      page('risque/dossiers/:id', 'Dossier de risque', ['admin.fraud.read'], () => import('./features/risk/risk.pages').then((m) => m.RiskCasePage)),
      page('audit', 'Journal d’audit', ['admin.audit.read'], () => import('./features/audit/audit.page').then((m) => m.AuditPage)),
      page('utilisateurs', 'Utilisateurs & rôles', ['admin.users.manage'], () => import('./features/users/users.pages').then((m) => m.UsersPage)),
      page('utilisateurs/:id', 'Compte interne', ['admin.users.manage'], () =>
        import('./features/users/users.pages').then((m) => m.UserDetailPage),
      ),
      page('parametres', 'Paramètres', ['admin.settings.manage'], () => import('./features/settings/settings.page').then((m) => m.SettingsPage)),

      {
        path: 'compte',
        title: 'Mon compte',
        loadComponent: () => import('./features/account/account.page').then((m) => m.AccountPage),
      },
      {
        path: 'acces-refuse',
        title: 'Accès refusé',
        loadComponent: () => import('./features/system/system.pages').then((m) => m.ForbiddenPage),
      },
      {
        path: '**',
        title: 'Page introuvable',
        loadComponent: () => import('./features/system/system.pages').then((m) => m.NotFoundPage),
      },
    ],
  },
];
