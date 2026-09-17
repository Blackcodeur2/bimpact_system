import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Money } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Loadable } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { formatAmount, formatDayKey, formatMoney } from '../../core/format';
import { statusLabel } from '../../core/labels';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { BarListComponent, LineChartComponent } from '../../shared/charts.component';
import { IconComponent } from '../../shared/icon.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { AuditActionPipe, RelativeTimePipe } from '../../shared/pipes';

interface DashboardData {
  period: { days: number; from: string; to: string };
  kpis: {
    members: { total: number; activeInPeriod: number; newInPeriod: number };
    kycPending: number;
    contributions: { count: number; amount: Money };
    payments: { count: number; amount: Money; failed: number };
    beneficiaries: { total: number; byStatus: Record<string, number> };
    trainingRate: number | null;
    certificates: number;
    accidentsOpen: number;
    supportOpen: number;
    riskOpen: number;
  };
  series: { date: string; registrations: number; contributions: { count: number; amount: Money }; payments: { count: number; amount: Money } }[];
  membersByCity: { city: string; members: number }[];
  alerts: { level: 'info' | 'warning' | 'critical'; code: string; message: string; count: number; link: string }[];
  recentActivity: { id: string; action: string; actorType: string; resourceType: string; createdAt: string }[];
}

interface Kpi {
  label: string;
  value: string;
  sub: string;
  link: string | null;
}

@Component({
  selector: 'bi-dashboard-page',
  imports: [
    FormsModule,
    RouterLink,
    AsyncStateComponent,
    PageHeaderComponent,
    LineChartComponent,
    BarListComponent,
    IconComponent,
    AuditActionPipe,
    RelativeTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    a.card.kpi {
      color: inherit;
      text-decoration: none;
      transition: border-color 0.15s ease;
    }
    a.card.kpi:hover {
      border-color: var(--primary-200);
    }
    .alert-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 0;
      border-bottom: 1px solid var(--neutral-100);
    }
    .alert-item:last-child {
      border-bottom: none;
    }
    .count {
      min-width: 32px;
      text-align: center;
      font-weight: 800;
      border-radius: 8px;
      padding: 2px 6px;
    }
    .level-critical {
      background: var(--danger-50);
      color: var(--danger-700);
    }
    .level-warning {
      background: var(--warning-50);
      color: var(--warning-700);
    }
    .level-info {
      background: var(--primary-50);
      color: var(--primary-700);
    }
    .activity {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--neutral-100);
    }
    .activity:last-child {
      border-bottom: none;
    }
  `,
  template: `
    <div class="page">
      <bi-page-header title="Tableau de bord" subtitle="Indicateurs calculés en temps réel sur les données de la plateforme.">
        <select class="input" style="height: 38px; width: auto" [ngModel]="days()" (ngModelChange)="changePeriod($event)" aria-label="Période">
          <option [ngValue]="7">7 derniers jours</option>
          <option [ngValue]="30">30 derniers jours</option>
          <option [ngValue]="90">90 derniers jours</option>
        </select>
        <button type="button" class="btn btn-secondary" (click)="data.load()" [disabled]="data.loading()">
          <bi-icon name="refresh" [size]="16" /> Actualiser
        </button>
      </bi-page-header>

      <bi-async [loading]="data.loading()" [error]="data.error()" [hasContent]="!!data.value()" (retry)="data.load()">
        @if (data.value(); as d) {
          <div class="stack">
            <div class="grid grid-4">
              @for (kpi of kpis(); track kpi.label) {
                @if (kpi.link) {
                  <a class="card kpi" [routerLink]="kpi.link">
                    <span class="kpi-label">{{ kpi.label }}</span>
                    <span class="kpi-value">{{ kpi.value }}</span>
                    <span class="kpi-sub">{{ kpi.sub }}</span>
                  </a>
                } @else {
                  <div class="card kpi">
                    <span class="kpi-label">{{ kpi.label }}</span>
                    <span class="kpi-value">{{ kpi.value }}</span>
                    <span class="kpi-sub">{{ kpi.sub }}</span>
                  </div>
                }
              }
            </div>

            <div class="grid grid-2">
              <section class="card">
                <div class="card-header"><h3>Inscriptions vérifiées</h3></div>
                <div class="card-body"><bi-line-chart [points]="registrations()" ariaLabel="Inscriptions par jour" /></div>
              </section>
              <section class="card">
                <div class="card-header">
                  <h3>Flux financiers</h3>
                  <span class="muted small">Rechargements confirmés par jour</span>
                </div>
                <div class="card-body">
                  <bi-line-chart [points]="payments()" ariaLabel="Rechargements par jour" color="var(--growth-600)" />
                </div>
              </section>
            </div>

            <div class="grid grid-main-side">
              <div class="stack">
                <section class="card">
                  <div class="card-header"><h3>Alertes</h3></div>
                  <div class="card-body">
                    @for (alert of d.alerts; track alert.code) {
                      <div class="alert-item">
                        <span class="count" [class]="'count level-' + alert.level">{{ alert.count }}</span>
                        <span class="spacer">{{ alert.message }}</span>
                        <a [routerLink]="alert.link" class="small">Ouvrir</a>
                      </div>
                    } @empty {
                      <p class="muted">Aucune alerte : les files de traitement sont à jour.</p>
                    }
                  </div>
                </section>
                <section class="card">
                  <div class="card-header"><h3>Activité récente</h3></div>
                  <div class="card-body">
                    @for (event of d.recentActivity; track event.id) {
                      <div class="activity">
                        <span>{{ event.action | auditAction }}</span>
                        <span class="muted small nowrap">{{ event.createdAt | ago }}</span>
                      </div>
                    } @empty {
                      <p class="muted">Aucune activité enregistrée.</p>
                    }
                  </div>
                </section>
              </div>
              <div class="stack">
                <section class="card">
                  <div class="card-header"><h3>Membres actifs par ville</h3></div>
                  <div class="card-body">
                    @if (cities().length > 0) {
                      <bi-bar-list [items]="cities()" />
                    } @else {
                      <p class="muted">Aucun membre actif pour le moment.</p>
                    }
                  </div>
                </section>
                <section class="card">
                  <div class="card-header"><h3>Parcours des bénéficiaires</h3></div>
                  <div class="card-body">
                    @if (beneficiaries().length > 0) {
                      <bi-bar-list [items]="beneficiaries()" />
                    } @else {
                      <p class="muted">Aucun bénéficiaire : aucun tirage n’a encore été publié.</p>
                    }
                  </div>
                </section>
              </div>
            </div>
          </div>
        }
      </bi-async>
    </div>
  `,
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStore);

  protected readonly days = signal(30);
  protected readonly data = new Loadable(() => this.api.get<DashboardData>('/admin/dashboard', { days: this.days() }));

  protected readonly kpis = computed<Kpi[]>(() => {
    const d = this.data.value();
    if (!d) return [];
    const k = d.kpis;
    const link = (route: string, permission: string) => (this.auth.can(permission) ? route : null);
    return [
      { label: 'Membres', value: formatAmount(String(k.members.total)), sub: `+${k.members.newInPeriod} sur la période`, link: link('/conducteurs', 'admin.drivers.read') },
      { label: 'Actifs sur la période', value: formatAmount(String(k.members.activeInPeriod)), sub: 'Au moins une connexion', link: null },
      { label: 'Contributions', value: formatMoney(k.contributions.amount), sub: `${k.contributions.count} paiement(s)`, link: link('/contributions', 'admin.contributions.read') },
      { label: 'Rechargements', value: formatMoney(k.payments.amount), sub: `${k.payments.count} confirmé(s) · ${k.payments.failed} échec(s)`, link: link('/paiements', 'admin.payments.read') },
      { label: 'Identités à vérifier', value: String(k.kycPending), sub: 'Dossiers soumis ou en revue', link: link('/kyc', 'admin.kyc.read') },
      {
        label: 'Bénéficiaires',
        value: String(k.beneficiaries.total),
        sub: k.trainingRate === null ? 'Aucun bénéficiaire' : `${String(k.trainingRate).replace('.', ',')} % formés · ${k.certificates} certificat(s)`,
        link: link('/beneficiaires', 'admin.beneficiaries.read'),
      },
      { label: 'Accidents en cours', value: String(k.accidentsOpen), sub: `${k.supportOpen} demande(s) de support à traiter`, link: link('/accidents', 'admin.accidents.read') },
      { label: 'Dossiers de risque ouverts', value: String(k.riskOpen), sub: 'Nouveaux, en enquête ou escaladés', link: link('/risque', 'admin.fraud.read') },
    ];
  });

  protected readonly registrations = computed(() =>
    (this.data.value()?.series ?? []).map((point) => ({ label: formatDayKey(point.date), value: point.registrations })),
  );

  protected readonly payments = computed(() =>
    (this.data.value()?.series ?? []).map((point) => ({
      label: formatDayKey(point.date),
      // Échelle du graphique uniquement : aucun calcul financier n'est fait côté navigateur.
      value: Number(point.payments.amount.amount),
      display: formatMoney(point.payments.amount),
    })),
  );

  protected readonly cities = computed(() =>
    (this.data.value()?.membersByCity ?? []).map((row) => ({ label: row.city, value: row.members })),
  );

  protected readonly beneficiaries = computed(() =>
    Object.entries(this.data.value()?.kpis.beneficiaries.byStatus ?? {}).map(([status, count]) => ({
      label: statusLabel('beneficiary', status).label,
      value: count,
    })),
  );

  ngOnInit(): void {
    void this.data.load();
  }

  protected changePeriod(days: number): void {
    this.days.set(days);
    void this.data.load();
  }
}
