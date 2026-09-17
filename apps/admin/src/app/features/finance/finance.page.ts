import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Money, Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Action, Loadable, PagedList } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { dayEnd, dayStart } from '../../core/format';
import { dictionaryOptions, LEDGER_TYPE_LABELS } from '../../core/labels';
import { ToastService } from '../../core/toast.service';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DictionaryLabelPipe, FrDateTimePipe, MoneyPipe } from '../../shared/pipes';
import { BadgeComponent, StatusBadgeComponent } from '../../shared/status-badge.component';

type Tab = 'overview' | 'ledger' | 'reconciliation';

interface ReconciliationSummary {
  status: string;
  checks: { code: string; status: string; count: number }[];
}

interface FinanceOverview {
  trialBalance: { debits: Money; credits: Money; balanced: boolean };
  systemAccounts: { id: string; code: string; name: string; type: string; purpose: string; balance: Money }[];
  memberWallets: { available: { accounts: number; balance: Money }; reserved: { accounts: number; balance: Money } };
  inconsistentAccounts: { id: string; code: string; name: string; cached: string; computed: string }[];
  provider: {
    code: string;
    testMode: boolean;
    pendingPayments: number;
    stalePendingPayments: number;
    webhookErrorsLast7Days: number;
    succeededWithoutLedger: number;
  };
  lastReconciliation: { ranAt: string; actorId: string | null; summary: ReconciliationSummary | null } | null;
}

interface LedgerTransaction {
  id: string;
  reference: string;
  type: string;
  description: string | null;
  currency: string;
  postedAt: string;
  reversalOfId: string | null;
  createdById: string | null;
  metadata: unknown;
  amount: Money;
  entries: {
    id: string;
    direction: 'DEBIT' | 'CREDIT';
    amount: Money;
    balanceAfter: Money;
    account: { code: string; name: string; type: string; ownerUserId: string | null };
  }[];
}

interface ReconciliationResult {
  ranAt: string;
  status: string;
  provider: { code: string; testMode: boolean };
  checks: { code: string; label: string; status: string; count: number; details: Record<string, unknown>[] }[];
}

interface ReconciliationRun {
  id: string;
  ranAt: string;
  actorId: string | null;
  actorName: string | null;
  summary: ReconciliationSummary | null;
}

const CHECK_LABELS: Record<string, string> = {
  TRIAL_BALANCE: 'Balance générale',
  ACCOUNT_BALANCES: 'Soldes des comptes',
  BALANCED_TRANSACTIONS: 'Transactions équilibrées',
  PAYMENTS_POSTED: 'Paiements comptabilisés',
  DEPOSITS_BACKED: 'Dépôts justifiés',
  CLEARING_MATCHES_PAYMENTS: 'Compte de compensation',
};

@Component({
  selector: 'bi-finance-page',
  imports: [
    FormsModule,
    JsonPipe,
    AsyncStateComponent,
    IconComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    BadgeComponent,
    DictionaryLabelPipe,
    FrDateTimePipe,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header
        title="Finance & ledger"
        subtitle="Grand livre en partie double, en lecture seule, et contrôles de cohérence. Une correction passe toujours par une contre-passation, jamais par une modification."
      >
        <button type="button" class="btn btn-secondary" (click)="refresh()"><bi-icon name="refresh" [size]="16" /> Actualiser</button>
      </bi-page-header>

      <div class="tabs" role="tablist" style="margin-bottom: 16px">
        @for (item of tabs; track item.id) {
          <button type="button" role="tab" class="tab" [class.active]="tab() === item.id" [attr.aria-selected]="tab() === item.id" (click)="select(item.id)">
            {{ item.label }}
          </button>
        }
      </div>

      @switch (tab()) {
        @case ('overview') {
          <bi-async [loading]="overview.loading()" [error]="overview.error()" [hasContent]="!!overview.value()" (retry)="overview.load()">
            @if (overview.value(); as o) {
              <div class="stack">
                @if (!o.trialBalance.balanced || o.inconsistentAccounts.length > 0 || o.provider.succeededWithoutLedger > 0) {
                  <div class="alert alert-danger" role="alert">
                    <bi-icon name="alert" [size]="18" />
                    <div>Anomalie comptable détectée. Lancez une réconciliation pour obtenir le détail des contrôles.</div>
                  </div>
                }
                <div class="grid grid-4">
                  <div class="card kpi">
                    <span class="kpi-label">Balance générale</span>
                    <span class="kpi-value" style="font-size: 18px"><bi-status domain="check" [code]="o.trialBalance.balanced ? 'BALANCED' : 'EXCEPTIONS'" /></span>
                    <span class="kpi-sub">Débits {{ o.trialBalance.debits | xaf }} · Crédits {{ o.trialBalance.credits | xaf }}</span>
                  </div>
                  <div class="card kpi">
                    <span class="kpi-label">Portefeuilles membres</span>
                    <span class="kpi-value">{{ o.memberWallets.available.balance | xaf }}</span>
                    <span class="kpi-sub">{{ o.memberWallets.available.accounts }} compte(s) disponible(s)</span>
                  </div>
                  <div class="card kpi">
                    <span class="kpi-label">Montants réservés</span>
                    <span class="kpi-value">{{ o.memberWallets.reserved.balance | xaf }}</span>
                    <span class="kpi-sub">{{ o.memberWallets.reserved.accounts }} compte(s)</span>
                  </div>
                  <div class="card kpi">
                    <span class="kpi-label">Paiements en attente</span>
                    <span class="kpi-value">{{ o.provider.pendingPayments }}</span>
                    <span class="kpi-sub">dont {{ o.provider.stalePendingPayments }} depuis plus de 30 min</span>
                  </div>
                </div>

                <div class="grid grid-main-side">
                  <section class="card">
                    <div class="card-header"><h3>Comptes système</h3></div>
                    <div class="table-wrap">
                      <table class="table">
                        <thead>
                          <tr>
                            <th>Compte</th>
                            <th>Type</th>
                            <th class="num">Solde</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (account of o.systemAccounts; track account.id) {
                            <tr>
                              <td>
                                <div class="cell-title">{{ account.name }}</div>
                                <div class="cell-sub mono">{{ account.code }}</div>
                              </td>
                              <td>{{ account.type }}</td>
                              <td class="num nowrap">{{ account.balance | xaf }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <div class="stack">
                    <section class="card">
                      <div class="card-header">
                        <h3>Opérateur de paiement</h3>
                        @if (o.provider.testMode) {
                          <bi-badge tone="warning">Mode test</bi-badge>
                        }
                      </div>
                      <div class="card-body">
                        <dl class="dl">
                          <dt>Fournisseur</dt>
                          <dd class="mono">{{ o.provider.code }}</dd>
                          <dt>En attente</dt>
                          <dd>{{ o.provider.pendingPayments }}</dd>
                          <dt>Bloqués &gt; 30 min</dt>
                          <dd>{{ o.provider.stalePendingPayments }}</dd>
                          <dt>Webhooks en erreur (7 j)</dt>
                          <dd>{{ o.provider.webhookErrorsLast7Days }}</dd>
                          <dt>Confirmés non comptabilisés</dt>
                          <dd>
                            @if (o.provider.succeededWithoutLedger > 0) {
                              <bi-badge tone="danger">{{ o.provider.succeededWithoutLedger }}</bi-badge>
                            } @else {
                              0
                            }
                          </dd>
                        </dl>
                      </div>
                    </section>
                    <section class="card">
                      <div class="card-header"><h3>Dernière réconciliation</h3></div>
                      <div class="card-body">
                        @if (o.lastReconciliation; as last) {
                          <div class="row">
                            <bi-status domain="check" [code]="last.summary?.status" />
                            <span class="muted small">{{ last.ranAt | frDateTime }}</span>
                          </div>
                          <p class="small" style="margin-top: 8px">Contrôles en anomalie : {{ failedChecks(last.summary) }}</p>
                        } @else {
                          <p class="muted">Aucune réconciliation lancée.</p>
                        }
                      </div>
                    </section>
                  </div>
                </div>

                @if (o.inconsistentAccounts.length > 0) {
                  <section class="card">
                    <div class="card-header"><h3>Comptes dont le solde diffère des écritures</h3></div>
                    <div class="table-wrap">
                      <table class="table">
                        <thead>
                          <tr>
                            <th>Compte</th>
                            <th class="num">Solde enregistré</th>
                            <th class="num">Solde recalculé</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (account of o.inconsistentAccounts; track account.id) {
                            <tr>
                              <td>
                                {{ account.name }}
                                <div class="cell-sub mono">{{ account.code }}</div>
                              </td>
                              <td class="num">{{ account.cached }}</td>
                              <td class="num">{{ account.computed }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  </section>
                }
              </div>
            }
          </bi-async>
        }

        @case ('ledger') {
          <section class="card">
            <form class="card-body filters" (submit)="$event.preventDefault(); ledger.reload()">
              <div class="field">
                <label for="ledger-reference">Référence</label>
                <input id="ledger-reference" name="reference" class="input" placeholder="payment:…" [ngModel]="reference()" (ngModelChange)="reference.set($event)" />
              </div>
              <div class="field">
                <label for="ledger-type">Type</label>
                <select id="ledger-type" name="type" class="input" [ngModel]="type()" (ngModelChange)="type.set($event); ledger.reload()">
                  <option value="">Tous</option>
                  @for (option of typeChoices; track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label for="ledger-account">Code de compte</label>
                <input id="ledger-account" name="accountCode" class="input" placeholder="system:…" [ngModel]="accountCode()" (ngModelChange)="accountCode.set($event)" />
              </div>
              <div class="field">
                <label for="ledger-from">Du</label>
                <input id="ledger-from" name="from" type="date" class="input" [ngModel]="from()" (ngModelChange)="from.set($event)" />
              </div>
              <div class="field">
                <label for="ledger-to">Au</label>
                <input id="ledger-to" name="to" type="date" class="input" [ngModel]="to()" (ngModelChange)="to.set($event)" />
              </div>
              <button type="submit" class="btn btn-secondary"><bi-icon name="search" [size]="16" /> Filtrer</button>
            </form>
            <bi-async
              [loading]="ledger.loading()"
              [error]="ledger.loaded() ? null : ledger.error()"
              [empty]="ledger.loaded() && ledger.items().length === 0"
              [hasContent]="ledger.items().length > 0"
              emptyTitle="Aucune écriture"
              emptyText="Aucune transaction ne correspond à ces critères."
              (retry)="ledger.reload()"
            >
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Référence</th>
                      <th>Type</th>
                      <th>Libellé</th>
                      <th class="num">Montant</th>
                      <th><span class="sr-only">Détail</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (tx of ledger.items(); track tx.id) {
                      <tr class="clickable" [attr.aria-expanded]="expanded() === tx.id" (click)="toggle(tx.id)">
                        <td class="nowrap">{{ tx.postedAt | frDateTime }}</td>
                        <td class="mono break">{{ tx.reference }}</td>
                        <td>
                          <span class="badge badge-plain">{{ tx.type | label: ledgerTypes }}</span>
                          @if (tx.reversalOfId) {
                            <bi-badge tone="warning">Contre-passation</bi-badge>
                          }
                        </td>
                        <td>{{ tx.description ?? '—' }}</td>
                        <td class="num nowrap">{{ tx.amount | xaf }}</td>
                        <td><bi-icon name="chevron-right" [size]="16" /></td>
                      </tr>
                      @if (expanded() === tx.id) {
                        <tr>
                          <td colspan="6" style="background: var(--neutral-50)">
                            <table class="table">
                              <thead>
                                <tr>
                                  <th>Sens</th>
                                  <th>Compte</th>
                                  <th class="num">Montant</th>
                                  <th class="num">Solde après</th>
                                </tr>
                              </thead>
                              <tbody>
                                @for (entry of tx.entries; track entry.id) {
                                  <tr>
                                    <td>{{ entry.direction === 'DEBIT' ? 'Débit' : 'Crédit' }}</td>
                                    <td>
                                      {{ entry.account.name }}
                                      <div class="cell-sub mono">{{ entry.account.code }}</div>
                                    </td>
                                    <td class="num nowrap">{{ entry.amount | xaf }}</td>
                                    <td class="num nowrap">{{ entry.balanceAfter | xaf }}</td>
                                  </tr>
                                }
                              </tbody>
                            </table>
                            @if (tx.metadata) {
                              <pre class="json" style="margin-top: 10px">{{ tx.metadata | json }}</pre>
                            }
                          </td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              </div>
              <bi-load-more [list]="ledger" />
            </bi-async>
          </section>
        }

        @case ('reconciliation') {
          <div class="stack">
            <section class="card">
              <div class="card-header">
                <div>
                  <h3>Contrôles de cohérence</h3>
                  <p class="muted small">Balance, soldes, équilibre des transactions, comptabilisation des paiements et compte de compensation de l’opérateur.</p>
                </div>
                @if (auth.can('admin.finance.reconcile')) {
                  <button type="button" class="btn" [disabled]="run.busy()" (click)="runReconciliation()">
                    @if (run.busy()) {
                      <span class="spinner"></span>
                    }
                    Lancer la réconciliation
                  </button>
                }
              </div>
              <div class="card-body">
                @if (run.error(); as err) {
                  <div class="alert alert-danger" role="alert">{{ err }}</div>
                }
                @if (result(); as r) {
                  <div class="row" style="margin-bottom: 12px">
                    <bi-status domain="check" [code]="r.status" />
                    <span class="muted small">Exécutée le {{ r.ranAt | frDateTime }} · opérateur {{ r.provider.code }}{{ r.provider.testMode ? ' (mode test)' : '' }}</span>
                  </div>
                  <div class="table-wrap">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Contrôle</th>
                          <th>Résultat</th>
                          <th class="num">Anomalies</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (check of r.checks; track check.code) {
                          <tr>
                            <td>{{ check.label }}</td>
                            <td><bi-status domain="check" [code]="check.status" /></td>
                            <td class="num">{{ check.count }}</td>
                          </tr>
                          @if (check.count > 0) {
                            <tr>
                              <td colspan="3"><pre class="json">{{ check.details | json }}</pre></td>
                            </tr>
                          }
                        }
                      </tbody>
                    </table>
                  </div>
                } @else {
                  <p class="muted">Le résultat détaillé s’affiche ici après le lancement. Chaque exécution est conservée dans le journal d’audit.</p>
                }
              </div>
            </section>

            <section class="card">
              <div class="card-header"><h3>Historique</h3></div>
              <bi-async
                [loading]="history.loading()"
                [error]="history.error()"
                [hasContent]="!!history.value()"
                [empty]="!!history.value() && historyItems().length === 0"
                emptyTitle="Aucune réconciliation"
                (retry)="history.load()"
              >
                <div class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Agent</th>
                        <th>Résultat</th>
                        <th>Contrôles en anomalie</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of historyItems(); track item.id) {
                        <tr>
                          <td class="nowrap">{{ item.ranAt | frDateTime }}</td>
                          <td>{{ item.actorName ?? '—' }}</td>
                          <td><bi-status domain="check" [code]="item.summary?.status" /></td>
                          <td>{{ failedChecks(item.summary) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </bi-async>
            </section>
          </div>
        }
      }
    </div>
  `,
})
export class FinancePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthStore);

  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Vue d’ensemble' },
    { id: 'ledger', label: 'Grand livre' },
    { id: 'reconciliation', label: 'Réconciliation' },
  ];
  protected readonly ledgerTypes = LEDGER_TYPE_LABELS;
  protected readonly typeChoices = dictionaryOptions(LEDGER_TYPE_LABELS);
  protected readonly tab = signal<Tab>('overview');
  protected readonly expanded = signal<string | null>(null);

  protected readonly reference = signal('');
  protected readonly type = signal('');
  protected readonly accountCode = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');

  protected readonly overview = new Loadable(() => this.api.get<FinanceOverview>('/admin/finance/overview'));
  protected readonly ledger = new PagedList<LedgerTransaction>((cursor) =>
    this.api.get<Page<LedgerTransaction>>('/admin/finance/ledger', {
      reference: this.reference().trim(),
      type: this.type(),
      accountCode: this.accountCode().trim(),
      from: dayStart(this.from()),
      to: dayEnd(this.to()),
      cursor,
      limit: 30,
    }),
  );
  protected readonly history = new Loadable(() => this.api.get<{ items: ReconciliationRun[] }>('/admin/finance/reconciliation'));
  protected readonly run = new Action();
  protected readonly result = signal<ReconciliationResult | null>(null);

  ngOnInit(): void {
    void this.overview.load();
  }

  protected historyItems(): ReconciliationRun[] {
    return this.history.value()?.items ?? [];
  }

  protected select(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'ledger' && !this.ledger.loaded()) void this.ledger.reload();
    if (tab === 'reconciliation' && !this.history.value()) void this.history.load();
    if (tab === 'overview' && !this.overview.value()) void this.overview.load();
  }

  protected refresh(): void {
    const tab = this.tab();
    if (tab === 'overview') void this.overview.load();
    if (tab === 'ledger') void this.ledger.reload();
    if (tab === 'reconciliation') void this.history.load();
  }

  protected toggle(id: string): void {
    this.expanded.update((current) => (current === id ? null : id));
  }

  protected failedChecks(summary: ReconciliationSummary | null | undefined): string {
    if (!summary) return '—';
    const failed = summary.checks.filter((check) => check.status !== 'OK');
    return failed.length === 0 ? 'Aucun' : failed.map((check) => `${CHECK_LABELS[check.code] ?? check.code} (${check.count})`).join(', ');
  }

  protected async runReconciliation(): Promise<void> {
    const result = await this.run.run(() => this.api.post<ReconciliationResult>('/admin/finance/reconciliation/run'));
    if (!result) return;
    this.result.set(result);
    if (result.status === 'BALANCED') this.toast.success('Réconciliation terminée : tous les contrôles sont conformes.');
    else this.toast.error('Réconciliation terminée : des anomalies ont été détectées.');
    void this.history.load();
    void this.overview.load();
  }
}
