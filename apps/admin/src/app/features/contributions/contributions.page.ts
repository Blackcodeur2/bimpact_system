import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Money, Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Loadable, PagedList } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { downloadCsv, toCsv } from '../../core/csv';
import { dayKey, formatDate, formatDayKey, formatMoney } from '../../core/format';
import { CONTRIBUTION_SOURCES } from '../../core/labels';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { LineChartComponent } from '../../shared/charts.component';
import { IconComponent } from '../../shared/icon.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DictionaryLabelPipe, FrDateTimePipe, FullNamePipe, MoneyPipe, PhonePipe } from '../../shared/pipes';

interface ContributionMetrics {
  date: string;
  activePlans: number;
  autoDebitPlans: number;
  paidToday: number;
  amountToday: Money;
  todayRate: number;
  last30Days: { date: string; count: number; amount: Money }[];
}

interface ContributionRow {
  id: string;
  date: string;
  amount: Money;
  source: string;
  paidAt: string;
  ledgerTransactionId: string | null;
  member: { userId: string; phone: string; firstName: string | null; lastName: string | null; city: string | null };
}

@Component({
  selector: 'bi-contributions-page',
  imports: [
    FormsModule,
    RouterLink,
    AsyncStateComponent,
    LineChartComponent,
    IconComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    DictionaryLabelPipe,
    FrDateTimePipe,
    FullNamePipe,
    MoneyPipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header title="Contributions" subtitle="Contributions quotidiennes payées depuis le portefeuille, manuellement ou par prélèvement automatique.">
        <button type="button" class="btn btn-secondary" (click)="metrics.load(); list.reload()"><bi-icon name="refresh" [size]="16" /> Actualiser</button>
      </bi-page-header>

      <div class="stack">
        <bi-async [loading]="metrics.loading()" [error]="metrics.error()" [hasContent]="!!metrics.value()" (retry)="metrics.load()">
          @if (metrics.value(); as m) {
            <div class="stack">
              <div class="grid grid-4">
                <div class="card kpi">
                  <span class="kpi-label">Plans actifs</span>
                  <span class="kpi-value">{{ m.activePlans }}</span>
                  <span class="kpi-sub">{{ m.autoDebitPlans }} avec prélèvement automatique</span>
                </div>
                <div class="card kpi">
                  <span class="kpi-label">Payées aujourd’hui</span>
                  <span class="kpi-value">{{ m.paidToday }}</span>
                  <span class="kpi-sub">{{ day(m.date) }}</span>
                </div>
                <div class="card kpi">
                  <span class="kpi-label">Montant du jour</span>
                  <span class="kpi-value">{{ m.amountToday | xaf }}</span>
                  <span class="kpi-sub">Jour couvert : {{ day(m.date) }}</span>
                </div>
                <div class="card kpi">
                  <span class="kpi-label">Taux du jour</span>
                  <span class="kpi-value">{{ rate(m.todayRate) }}</span>
                  <span class="kpi-sub">des plans actifs ont contribué</span>
                </div>
              </div>
              <section class="card">
                <div class="card-header">
                  <h3>Contributions des 30 derniers jours</h3>
                  <span class="muted small">Nombre de jours payés par date couverte</span>
                </div>
                <div class="card-body"><bi-line-chart [points]="series()" ariaLabel="Contributions par jour" color="var(--growth-600)" /></div>
              </section>
            </div>
          }
        </bi-async>

        <section class="card">
          <div class="card-header">
            <h3>Paiements de contribution</h3>
            <button type="button" class="btn btn-secondary btn-sm" [disabled]="list.items().length === 0" (click)="exportCsv()">
              <bi-icon name="download" [size]="14" /> CSV
            </button>
          </div>
          <div class="card-body filters">
            <div class="field">
              <label for="contributions-date">Jour couvert</label>
              <input id="contributions-date" name="date" type="date" class="input" [max]="today" [ngModel]="date()" (ngModelChange)="date.set($event); list.reload()" />
            </div>
            @if (date()) {
              <button type="button" class="btn btn-ghost btn-sm" (click)="date.set(''); list.reload()">Tous les jours</button>
            }
          </div>
          <bi-async
            [loading]="list.loading()"
            [error]="list.loaded() ? null : list.error()"
            [empty]="list.loaded() && list.items().length === 0"
            [hasContent]="list.items().length > 0"
            emptyTitle="Aucune contribution"
            emptyText="Aucune contribution payée pour ce critère."
            (retry)="list.reload()"
          >
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Payée le</th>
                    <th>Jour couvert</th>
                    <th>Membre</th>
                    <th>Ville</th>
                    <th class="num">Montant</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of list.items(); track row.id) {
                    <tr>
                      <td class="nowrap">{{ row.paidAt | frDateTime }}</td>
                      <td class="nowrap">{{ day(row.date) }}</td>
                      <td>
                        @if (auth.can('admin.drivers.read')) {
                          <a [routerLink]="['/conducteurs', row.member.userId]">{{ row.member | fullName }}</a>
                        } @else {
                          {{ row.member | fullName }}
                        }
                        <div class="cell-sub">{{ row.member.phone | phone }}</div>
                      </td>
                      <td>{{ row.member.city ?? '—' }}</td>
                      <td class="num nowrap">{{ row.amount | xaf }}</td>
                      <td>{{ row.source | label: sourceLabels }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <bi-load-more [list]="list" />
          </bi-async>
        </section>
      </div>
    </div>
  `,
})
export class ContributionsPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthStore);

  protected readonly today = dayKey();
  protected readonly sourceLabels = CONTRIBUTION_SOURCES;
  protected readonly date = signal('');
  protected readonly metrics = new Loadable(() => this.api.get<ContributionMetrics>('/admin/contributions/metrics'));
  protected readonly list = new PagedList<ContributionRow>((cursor) =>
    this.api.get<Page<ContributionRow>>('/admin/contributions', { date: this.date(), cursor, limit: 30 }),
  );

  protected readonly series = computed(() =>
    (this.metrics.value()?.last30Days ?? []).map((point) => ({
      label: formatDayKey(point.date),
      value: point.count,
      display: `${point.count} · ${formatMoney(point.amount)}`,
    })),
  );

  ngOnInit(): void {
    void this.metrics.load();
    void this.list.reload();
  }

  protected day(value: string): string {
    return formatDate(`${value}T12:00:00Z`);
  }

  protected rate(value: number): string {
    return `${String(value).replace('.', ',')} %`;
  }

  protected exportCsv(): void {
    const csv = toCsv<ContributionRow>(
      [
        { label: 'Payée le', value: (row) => row.paidAt },
        { label: 'Jour couvert', value: (row) => row.date },
        { label: 'Prénom', value: (row) => row.member.firstName },
        { label: 'Nom', value: (row) => row.member.lastName },
        { label: 'Téléphone', value: (row) => row.member.phone },
        { label: 'Ville', value: (row) => row.member.city },
        { label: 'Montant (FCFA)', value: (row) => row.amount.amount },
        { label: 'Source', value: (row) => CONTRIBUTION_SOURCES[row.source] ?? row.source },
      ],
      this.list.items(),
    );
    downloadCsv(`contributions-${this.date() || dayKey()}.csv`, csv);
  }
}
