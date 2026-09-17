import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Money, Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Action, Loadable, PagedList } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { downloadCsv, toCsv } from '../../core/csv';
import { dayEnd, dayKey, dayStart, formatMoney } from '../../core/format';
import { CHANNEL_LABELS, dictionaryOptions, LEDGER_TYPE_LABELS, statusLabel, statusOptions } from '../../core/labels';
import { ToastService } from '../../core/toast.service';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DictionaryLabelPipe, FrDateTimePipe, MoneyPipe, PhonePipe } from '../../shared/pipes';
import { BadgeComponent, StatusBadgeComponent } from '../../shared/status-badge.component';

interface PaymentRow {
  id: string;
  status: string;
  provider: string;
  testMode: boolean;
  channel: string;
  channelLabel: string;
  amount: Money;
  fee: Money;
  payerPhone: string;
  externalReference: string | null;
  payerInstructions: string | null;
  failure: { code: string; message: string | null } | null;
  ledgerTransactionId: string | null;
  expiresAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  member: { userId: string; phone: string; name: string | null };
}

interface PaymentDetail extends PaymentRow {
  updatedAt: string;
  webhooks: {
    id: string;
    eventId: string;
    status: string;
    receivedAt: string;
    processedAt: string | null;
    processingError: string | null;
    payload: unknown;
  }[];
  ledgerTransaction: {
    id: string;
    reference: string;
    type: string;
    postedAt: string;
    entries: { direction: 'DEBIT' | 'CREDIT'; amount: Money; account: { code: string; name: string } }[];
  } | null;
}

@Component({
  selector: 'bi-payments-page',
  imports: [
    FormsModule,
    RouterLink,
    AsyncStateComponent,
    IconComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    BadgeComponent,
    FrDateTimePipe,
    MoneyPipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header title="Paiements" subtitle="Rechargements Mobile Money : statut chez l'opérateur, webhooks reçus et écriture comptable associée.">
        <button type="button" class="btn btn-secondary" [disabled]="list.items().length === 0" (click)="exportCsv()">
          <bi-icon name="download" [size]="16" /> Exporter les lignes affichées
        </button>
      </bi-page-header>

      <section class="card">
        <form class="card-body filters" (submit)="$event.preventDefault(); list.reload()">
          <div class="field">
            <label for="payments-q">Recherche</label>
            <input id="payments-q" name="q" class="input" placeholder="Téléphone ou référence opérateur" [ngModel]="q()" (ngModelChange)="q.set($event)" />
          </div>
          <div class="field">
            <label for="payments-status">Statut</label>
            <select id="payments-status" name="status" class="input" [ngModel]="status()" (ngModelChange)="status.set($event); list.reload()">
              <option value="">Tous</option>
              @for (option of statusChoices; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="payments-channel">Moyen</label>
            <select id="payments-channel" name="channel" class="input" [ngModel]="channel()" (ngModelChange)="channel.set($event); list.reload()">
              <option value="">Tous</option>
              @for (option of channelChoices; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="payments-from">Du</label>
            <input id="payments-from" name="from" type="date" class="input" [ngModel]="from()" (ngModelChange)="from.set($event)" />
          </div>
          <div class="field">
            <label for="payments-to">Au</label>
            <input id="payments-to" name="to" type="date" class="input" [ngModel]="to()" (ngModelChange)="to.set($event)" />
          </div>
          <button type="submit" class="btn btn-secondary"><bi-icon name="search" [size]="16" /> Filtrer</button>
        </form>

        <bi-async
          [loading]="list.loading()"
          [error]="list.loaded() ? null : list.error()"
          [empty]="list.loaded() && list.items().length === 0"
          [hasContent]="list.items().length > 0"
          emptyTitle="Aucun paiement"
          emptyText="Aucun rechargement ne correspond à ces critères."
          (retry)="list.reload()"
        >
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Membre</th>
                  <th class="num">Montant</th>
                  <th>Moyen</th>
                  <th>Statut</th>
                  <th>Référence opérateur</th>
                </tr>
              </thead>
              <tbody>
                @for (row of list.items(); track row.id) {
                  <tr class="clickable" (click)="open(row.id)">
                    <td class="nowrap">
                      <a [routerLink]="['/paiements', row.id]" (click)="$event.stopPropagation()">{{ row.createdAt | frDateTime }}</a>
                    </td>
                    <td>
                      {{ row.member.name ?? 'Nom non renseigné' }}
                      <div class="cell-sub">{{ row.member.phone | phone }}</div>
                    </td>
                    <td class="num nowrap">{{ row.amount | xaf }}</td>
                    <td>{{ row.channelLabel }}</td>
                    <td>
                      <div class="row" style="gap: 6px">
                        <bi-status domain="payment" [code]="row.status" />
                        @if (row.testMode) {
                          <bi-badge tone="warning">Test</bi-badge>
                        }
                      </div>
                    </td>
                    <td class="mono break">{{ row.externalReference ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <bi-load-more [list]="list" />
        </bi-async>
      </section>
    </div>
  `,
})
export class PaymentsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly statusChoices = statusOptions('payment');
  protected readonly channelChoices = dictionaryOptions(CHANNEL_LABELS);
  protected readonly q = signal('');
  protected readonly status = signal('');
  protected readonly channel = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');

  protected readonly list = new PagedList<PaymentRow>((cursor) =>
    this.api.get<Page<PaymentRow>>('/admin/payments', {
      q: this.q().trim(),
      status: this.status(),
      channel: this.channel(),
      from: dayStart(this.from()),
      to: dayEnd(this.to()),
      cursor,
      limit: 25,
    }),
  );

  ngOnInit(): void {
    void this.list.reload();
  }

  protected open(id: string): void {
    void this.router.navigate(['/paiements', id]);
  }

  protected exportCsv(): void {
    const csv = toCsv<PaymentRow>(
      [
        { label: 'Date', value: (row) => row.createdAt },
        { label: 'Membre', value: (row) => row.member.name },
        { label: 'Téléphone du compte', value: (row) => row.member.phone },
        { label: 'Numéro payeur', value: (row) => row.payerPhone },
        { label: 'Montant (FCFA)', value: (row) => row.amount.amount },
        { label: 'Moyen', value: (row) => row.channelLabel },
        { label: 'Statut', value: (row) => statusLabel('payment', row.status).label },
        { label: 'Référence opérateur', value: (row) => row.externalReference },
        { label: 'Confirmé le', value: (row) => row.confirmedAt },
        { label: 'Mode test', value: (row) => (row.testMode ? 'oui' : 'non') },
      ],
      this.list.items(),
    );
    downloadCsv(`paiements-${dayKey()}.csv`, csv);
  }
}

@Component({
  selector: 'bi-payment-detail-page',
  imports: [
    JsonPipe,
    RouterLink,
    AsyncStateComponent,
    IconComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    BadgeComponent,
    DictionaryLabelPipe,
    FrDateTimePipe,
    MoneyPipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header [title]="title()" subtitle="Le statut n'est jamais forcé à la main : l'opérateur est réinterrogé et sa réponse appliquée." backLink="/paiements" backLabel="Paiements">
        @if (data.value(); as d) {
          @if (auth.can('admin.payments.reconcile') && (d.status === 'PENDING' || d.status === 'CREATED')) {
            <button type="button" class="btn" [disabled]="reconcile.busy()" (click)="refreshFromProvider()">
              @if (reconcile.busy()) {
                <span class="spinner"></span>
              } @else {
                <bi-icon name="refresh" [size]="16" />
              }
              Réinterroger l’opérateur
            </button>
          }
        }
      </bi-page-header>

      <bi-async [loading]="data.loading()" [error]="data.error()" [hasContent]="!!data.value()" (retry)="data.load()">
        @if (data.value(); as d) {
          <div class="stack">
            @if (reconcile.error(); as err) {
              <div class="alert alert-danger" role="alert">{{ err }}</div>
            }
            @if (d.failure; as failure) {
              <div class="alert alert-danger">
                <bi-icon name="alert" [size]="18" />
                <div><strong>{{ failure.code }}</strong> — {{ failure.message ?? 'Échec signalé par l’opérateur.' }}</div>
              </div>
            }
            <div class="grid grid-main-side">
              <div class="stack">
                <section class="card">
                  <div class="card-header">
                    <h3>Rechargement</h3>
                    <div class="row" style="gap: 6px">
                      <bi-status domain="payment" [code]="d.status" />
                      @if (d.testMode) {
                        <bi-badge tone="warning">Mode test</bi-badge>
                      }
                    </div>
                  </div>
                  <div class="card-body">
                    <dl class="dl">
                      <dt>Montant</dt>
                      <dd>{{ d.amount | xaf }}</dd>
                      <dt>Frais</dt>
                      <dd>{{ d.fee | xaf }}</dd>
                      <dt>Moyen</dt>
                      <dd>{{ d.channelLabel }}</dd>
                      <dt>Numéro payeur</dt>
                      <dd>{{ d.payerPhone | phone }}</dd>
                      <dt>Fournisseur</dt>
                      <dd class="mono">{{ d.provider }}</dd>
                      <dt>Référence opérateur</dt>
                      <dd class="mono">{{ d.externalReference ?? '—' }}</dd>
                      @if (d.payerInstructions) {
                        <dt>Instructions au payeur</dt>
                        <dd>{{ d.payerInstructions }}</dd>
                      }
                      <dt>Créé le</dt>
                      <dd>{{ d.createdAt | frDateTime }}</dd>
                      <dt>Expire le</dt>
                      <dd>{{ d.expiresAt | frDateTime }}</dd>
                      <dt>Confirmé le</dt>
                      <dd>{{ d.confirmedAt | frDateTime }}</dd>
                      <dt>Dernière mise à jour</dt>
                      <dd>{{ d.updatedAt | frDateTime }}</dd>
                    </dl>
                  </div>
                </section>

                <section class="card">
                  <div class="card-header"><h3>Webhooks reçus</h3></div>
                  <div class="card-body">
                    <ul class="timeline">
                      @for (hook of d.webhooks; track hook.id) {
                        <li>
                          <div class="row" style="gap: 8px">
                            <strong>{{ hook.status }}</strong>
                            <span class="mono small muted">{{ hook.eventId }}</span>
                            @if (hook.processingError) {
                              <bi-badge tone="danger">Erreur de traitement</bi-badge>
                            }
                          </div>
                          <div class="small muted">Reçu {{ hook.receivedAt | frDateTime }} · traité {{ hook.processedAt | frDateTime }}</div>
                          @if (hook.processingError) {
                            <p class="small field-error">{{ hook.processingError }}</p>
                          }
                          <pre class="json" style="margin-top: 6px">{{ hook.payload | json }}</pre>
                        </li>
                      } @empty {
                        <p class="muted small">Aucun webhook reçu pour ce paiement.</p>
                      }
                    </ul>
                  </div>
                </section>
              </div>

              <div class="stack">
                <section class="card">
                  <div class="card-header"><h3>Membre</h3></div>
                  <div class="card-body">
                    <dl class="dl">
                      <dt>Nom</dt>
                      <dd>
                        @if (auth.can('admin.drivers.read')) {
                          <a [routerLink]="['/conducteurs', d.member.userId]">{{ d.member.name ?? 'Nom non renseigné' }}</a>
                        } @else {
                          {{ d.member.name ?? 'Nom non renseigné' }}
                        }
                      </dd>
                      <dt>Téléphone</dt>
                      <dd>{{ d.member.phone | phone }}</dd>
                    </dl>
                  </div>
                </section>
                <section class="card">
                  <div class="card-header"><h3>Écriture comptable</h3></div>
                  <div class="card-body">
                    @if (d.ledgerTransaction; as tx) {
                      <p class="mono small break">{{ tx.reference }}</p>
                      <p class="small muted" style="margin-bottom: 8px">{{ tx.type | label: ledgerTypes }} · {{ tx.postedAt | frDateTime }}</p>
                      @for (entry of tx.entries; track $index) {
                        <div class="row-nowrap small" style="padding: 4px 0">
                          <span class="spacer">{{ entry.direction === 'DEBIT' ? 'Débit' : 'Crédit' }} · {{ entry.account.name }}</span>
                          <span class="num nowrap">{{ entry.amount | xaf }}</span>
                        </div>
                      }
                    } @else {
                      <p class="muted small">Aucune écriture : le solde n’est crédité qu’après confirmation de l’opérateur.</p>
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
export class PaymentDetailPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthStore);

  readonly id = input.required<string>();

  protected readonly ledgerTypes = LEDGER_TYPE_LABELS;
  protected readonly data = new Loadable(() => this.api.get<PaymentDetail>(`/admin/payments/${this.id()}`));
  protected readonly reconcile = new Action();
  protected readonly title = computed(() => {
    const d = this.data.value();
    return d ? `Rechargement de ${formatMoney(d.amount)}` : 'Paiement';
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.data.load());
    });
  }

  protected async refreshFromProvider(): Promise<void> {
    const result = await this.reconcile.run(() => this.api.post<PaymentDetail>(`/admin/payments/${this.id()}/reconcile`));
    if (!result) return;
    this.data.set(result);
    this.toast.info(`Statut après interrogation de l’opérateur : ${statusLabel('payment', result.status).label}.`);
  }
}
