import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Action, Loadable, PagedList } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { RISK_ACTION_LABELS, RISK_EVENT_LABELS, SIGNAL_LABELS, statusLabel, statusOptions } from '../../core/labels';
import { ToastService } from '../../core/toast.service';
import { ActionDialogComponent } from '../../shared/action-dialog.component';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DictionaryLabelPipe, FrDateTimePipe, PhonePipe, RelativeTimePipe } from '../../shared/pipes';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

type Tab = 'cases' | 'signals' | 'rules';
type RiskAction = 'NOTE' | 'ASSIGN_SELF' | 'INVESTIGATE' | 'ESCALATE' | 'RESOLVE' | 'FALSE_POSITIVE';

interface RiskCaseRow {
  id: string;
  reference: string;
  signalType: string;
  summary: string;
  status: string;
  member: { userId: string; name: string | null; phone: string };
  assignedToId: string | null;
  assignedToName: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

interface SignalMember {
  userId: string;
  name: string | null;
  phone: string | null;
  status: string | null;
}

interface SignalItem {
  type: string;
  key: string;
  count: number;
  lastSeenAt: string;
  members: SignalMember[];
  openCases: { id: string; reference: string; status: string; userId: string }[];
}

interface RiskCaseDetail {
  id: string;
  reference: string;
  signalType: string;
  summary: string;
  status: string;
  resolution: string | null;
  member: { userId: string; name: string | null; phone: string; status: string; city: string | null };
  assignedToId: string | null;
  assignedToName: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  allowedTransitions: string[];
  events: {
    id: string;
    type: string;
    fromStatus: string | null;
    toStatus: string | null;
    note: string | null;
    actorId: string;
    actorName: string | null;
    createdAt: string;
  }[];
}

@Component({
  selector: 'bi-risk-page',
  imports: [
    FormsModule,
    RouterLink,
    ActionDialogComponent,
    AsyncStateComponent,
    IconComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    DictionaryLabelPipe,
    FrDateTimePipe,
    PhonePipe,
    RelativeTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header
        title="Fraude & risque"
        subtitle="Signaux calculés à la demande sur les données réelles, sans score opaque, et dossiers d'enquête dont chaque action est documentée."
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
        @case ('cases') {
          <section class="card">
            <div class="card-body filters">
              <div class="field">
                <label for="risk-status">Statut</label>
                <select id="risk-status" name="status" class="input" [ngModel]="status()" (ngModelChange)="status.set($event); cases.reload()">
                  <option value="">Tous les dossiers</option>
                  @for (option of statusChoices; track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
              </div>
            </div>
            <bi-async
              [loading]="cases.loading()"
              [error]="cases.loaded() ? null : cases.error()"
              [empty]="cases.loaded() && cases.items().length === 0"
              [hasContent]="cases.items().length > 0"
              emptyTitle="Aucun dossier"
              emptyText="Ouvrez un dossier depuis un signal ou la fiche d'un conducteur."
              (retry)="cases.reload()"
            >
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Dossier</th>
                      <th>Membre</th>
                      <th>Résumé</th>
                      <th>Attribué à</th>
                      <th>Ouvert</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of cases.items(); track row.id) {
                      <tr class="clickable" (click)="openCase(row.id)">
                        <td class="nowrap">
                          <a class="mono" [routerLink]="['/risque/dossiers', row.id]" (click)="$event.stopPropagation()">{{ row.reference }}</a>
                          <div class="cell-sub">{{ row.signalType | label: signalLabels }}</div>
                        </td>
                        <td>
                          {{ row.member.name ?? 'Nom non renseigné' }}
                          <div class="cell-sub">{{ row.member.phone | phone }}</div>
                        </td>
                        <td class="break">{{ row.summary }}</td>
                        <td>{{ row.assignedToName ?? 'Non attribué' }}</td>
                        <td class="nowrap">{{ row.createdAt | frDateTime }}</td>
                        <td><bi-status domain="risk" [code]="row.status" /></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <bi-load-more [list]="cases" />
            </bi-async>
          </section>
        }

        @case ('signals') {
          <bi-async
            [loading]="signals.loading()"
            [error]="signals.error()"
            [hasContent]="!!signals.value()"
            [empty]="!!signals.value() && signalItems().length === 0"
            emptyTitle="Aucun signal"
            emptyText="Aucune situation ne déclenche les règles de détection actuellement."
            (retry)="signals.load()"
          >
            <div class="stack">
              <p class="muted small">Calculé le {{ signals.value()?.generatedAt | frDateTime }}.</p>
              @for (item of signalItems(); track $index) {
                <section class="card">
                  <div class="card-header">
                    <div>
                      <h3>{{ item.type | label: signalLabels }}</h3>
                      <span class="muted small">{{ item.count }} occurrence(s) · dernière {{ item.lastSeenAt | ago }}</span>
                    </div>
                    <span class="mono small muted break">{{ item.key }}</span>
                  </div>
                  <div class="table-wrap">
                    <table class="table">
                      <tbody>
                        @for (member of item.members; track member.userId) {
                          <tr>
                            <td>
                              @if (auth.can('admin.drivers.read')) {
                                <a class="cell-title" [routerLink]="['/conducteurs', member.userId]">{{ member.name ?? 'Nom non renseigné' }}</a>
                              } @else {
                                <span class="cell-title">{{ member.name ?? 'Nom non renseigné' }}</span>
                              }
                              <div class="cell-sub">{{ member.phone | phone }}</div>
                            </td>
                            <td><bi-status domain="user" [code]="member.status" /></td>
                            <td class="num">
                              @if (openCaseFor(item, member.userId); as existing) {
                                <a class="mono" [routerLink]="['/risque/dossiers', existing.id]">{{ existing.reference }}</a>
                                <bi-status domain="risk" [code]="existing.status" />
                              } @else if (auth.can('admin.fraud.act')) {
                                <button type="button" class="btn btn-secondary btn-sm" (click)="startOpen(item.type, member, openDialog)">Ouvrir un dossier</button>
                              }
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </section>
              }
            </div>
          </bi-async>
        }

        @case ('rules') {
          <bi-async [loading]="rules.loading()" [error]="rules.error()" [hasContent]="!!rules.value()" (retry)="rules.load()">
            <section class="card">
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Règle</th>
                      <th>Description</th>
                      <th>Seuil</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (rule of rules.value()?.items ?? []; track rule.code) {
                      <tr>
                        <td>
                          <div class="cell-title">{{ rule.label }}</div>
                          <div class="cell-sub mono">{{ rule.code }}</div>
                        </td>
                        <td>{{ rule.description }}</td>
                        <td class="nowrap">{{ rule.threshold }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          </bi-async>
        }
      }

      <bi-action-dialog
        #openDialog
        title="Ouvrir un dossier de risque"
        [message]="openMessage()"
        confirmLabel="Ouvrir le dossier"
        reasonLabel="Résumé des faits constatés"
        [busy]="openAction.busy()"
        [error]="openAction.error()"
        (confirmed)="confirmOpen($event, openDialog)"
      />
    </div>
  `,
})
export class RiskPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthStore);

  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'cases', label: 'Dossiers' },
    { id: 'signals', label: 'Signaux détectés' },
    { id: 'rules', label: 'Règles' },
  ];
  protected readonly signalLabels = SIGNAL_LABELS;
  protected readonly statusChoices = statusOptions('risk');
  protected readonly tab = signal<Tab>('cases');
  protected readonly status = signal('');

  protected readonly cases = new PagedList<RiskCaseRow>((cursor) =>
    this.api.get<Page<RiskCaseRow>>('/admin/fraud/cases', { status: this.status(), cursor, limit: 25 }),
  );
  protected readonly signals = new Loadable(() => this.api.get<{ generatedAt: string; items: SignalItem[] }>('/admin/fraud/signals'));
  protected readonly rules = new Loadable(() =>
    this.api.get<{ items: { code: string; label: string; description: string; threshold: string }[] }>('/admin/fraud/rules'),
  );

  protected readonly openAction = new Action();
  protected readonly opening = signal<{ signalType: string; member: SignalMember } | null>(null);
  protected readonly openMessage = computed(() => {
    const target = this.opening();
    return target ? `${SIGNAL_LABELS[target.signalType] ?? target.signalType} — ${target.member.name ?? 'membre sans nom'}.` : '';
  });

  ngOnInit(): void {
    void this.cases.reload();
  }

  protected signalItems(): SignalItem[] {
    return this.signals.value()?.items ?? [];
  }

  protected select(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'signals' && !this.signals.value()) void this.signals.load();
    if (tab === 'rules' && !this.rules.value()) void this.rules.load();
  }

  protected refresh(): void {
    const tab = this.tab();
    if (tab === 'cases') void this.cases.reload();
    if (tab === 'signals') void this.signals.load();
    if (tab === 'rules') void this.rules.load();
  }

  protected openCase(id: string): void {
    void this.router.navigate(['/risque/dossiers', id]);
  }

  protected openCaseFor(item: SignalItem, userId: string) {
    return item.openCases.find((riskCase) => riskCase.userId === userId) ?? null;
  }

  protected startOpen(signalType: string, member: SignalMember, dialog: ActionDialogComponent): void {
    this.openAction.reset();
    this.opening.set({ signalType, member });
    dialog.open();
  }

  protected async confirmOpen(summary: string, dialog: ActionDialogComponent): Promise<void> {
    const target = this.opening();
    if (!target) return;
    const result = await this.openAction.run(() =>
      this.api.post<RiskCaseDetail>('/admin/fraud/cases', { userId: target.member.userId, signalType: target.signalType, summary }),
    );
    if (!result) return;
    dialog.close();
    this.toast.success(`Dossier ${result.reference} ouvert.`);
    void this.router.navigate(['/risque/dossiers', result.id]);
  }
}

@Component({
  selector: 'bi-risk-case-page',
  imports: [
    RouterLink,
    ActionDialogComponent,
    AsyncStateComponent,
    IconComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    DictionaryLabelPipe,
    FrDateTimePipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header [title]="pageTitle()" [subtitle]="subtitle()" backLink="/risque" backLabel="Fraude & risque">
        @if (data.value(); as d) {
          @if (canAct()) {
            @if (d.assignedToId !== auth.user()?.id) {
              <button type="button" class="btn btn-secondary" [disabled]="action.busy()" (click)="run('ASSIGN_SELF')">Me l’attribuer</button>
            }
            @if (d.allowedTransitions.includes('INVESTIGATING')) {
              <button type="button" class="btn btn-secondary" [disabled]="action.busy()" (click)="run('INVESTIGATE')">Ouvrir l’enquête</button>
            }
            @if (d.allowedTransitions.includes('ESCALATED')) {
              <button type="button" class="btn btn-danger" (click)="ask('ESCALATE', noteDialog)">Escalader</button>
            }
            @if (d.allowedTransitions.includes('RESOLVED')) {
              <button type="button" class="btn btn-success" (click)="ask('RESOLVE', noteDialog)">Résoudre</button>
            }
            @if (d.allowedTransitions.includes('FALSE_POSITIVE')) {
              <button type="button" class="btn btn-secondary" (click)="ask('FALSE_POSITIVE', noteDialog)">Faux positif</button>
            }
            <button type="button" class="btn btn-ghost" (click)="ask('NOTE', noteDialog)"><bi-icon name="plus" [size]="16" /> Note</button>
          }
        }
      </bi-page-header>

      <bi-async [loading]="data.loading()" [error]="data.error()" [hasContent]="!!data.value()" (retry)="data.load()">
        @if (data.value(); as d) {
          <div class="stack">
            @if (action.error() && !pending()) {
              <div class="alert alert-danger" role="alert">{{ action.error() }}</div>
            }
            <div class="grid grid-main-side">
              <div class="stack">
                <section class="card">
                  <div class="card-header">
                    <h3>Faits signalés</h3>
                    <bi-status domain="risk" [code]="d.status" />
                  </div>
                  <div class="card-body stack-sm">
                    <p class="pre-line break">{{ d.summary }}</p>
                    @if (d.resolution) {
                      <div class="alert alert-success">
                        <div><strong>Conclusion :</strong> {{ d.resolution }}</div>
                      </div>
                    }
                  </div>
                </section>
                <section class="card">
                  <div class="card-header"><h3>Chronologie</h3></div>
                  <div class="card-body">
                    <ul class="timeline">
                      @for (event of d.events; track event.id) {
                        <li>
                          <div class="row" style="gap: 8px">
                            <strong>{{ event.type | label: eventLabels }}</strong>
                            @if (event.toStatus) {
                              <span class="small">{{ event.fromStatus ? statusText(event.fromStatus) + ' → ' : '' }}{{ statusText(event.toStatus) }}</span>
                            }
                          </div>
                          <div class="small muted">{{ event.actorName ?? 'Agent' }} · {{ event.createdAt | frDateTime }}</div>
                          @if (event.note) {
                            <p class="small pre-line break">{{ event.note }}</p>
                          }
                        </li>
                      }
                    </ul>
                  </div>
                </section>
              </div>

              <div class="stack">
                <section class="card">
                  <div class="card-header"><h3>Membre concerné</h3></div>
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
                      <dt>Ville</dt>
                      <dd>{{ d.member.city ?? '—' }}</dd>
                      <dt>Compte</dt>
                      <dd><bi-status domain="user" [code]="d.member.status" /></dd>
                    </dl>
                  </div>
                </section>
                <section class="card">
                  <div class="card-header"><h3>Suivi</h3></div>
                  <div class="card-body">
                    <dl class="dl">
                      <dt>Signal</dt>
                      <dd>{{ d.signalType | label: signalLabels }}</dd>
                      <dt>Ouvert par</dt>
                      <dd>{{ d.createdByName ?? '—' }}</dd>
                      <dt>Ouvert le</dt>
                      <dd>{{ d.createdAt | frDateTime }}</dd>
                      <dt>Attribué à</dt>
                      <dd>{{ d.assignedToName ?? 'Non attribué' }}</dd>
                      <dt>Clôturé le</dt>
                      <dd>{{ d.closedAt | frDateTime }}</dd>
                    </dl>
                  </div>
                </section>
              </div>
            </div>
          </div>
        }
      </bi-async>

      <bi-action-dialog
        #noteDialog
        [title]="pendingTitle()"
        [message]="pendingMessage()"
        confirmLabel="Enregistrer"
        [tone]="pending() === 'RESOLVE' ? 'success' : pending() === 'ESCALATE' ? 'danger' : 'primary'"
        reasonLabel="Note documentant l'action"
        [reasonMin]="3"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="confirm($event, noteDialog)"
      />
    </div>
  `,
})
export class RiskCasePage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthStore);

  readonly id = input.required<string>();

  protected readonly signalLabels = SIGNAL_LABELS;
  protected readonly eventLabels = RISK_EVENT_LABELS;
  protected readonly data = new Loadable(() => this.api.get<RiskCaseDetail>(`/admin/fraud/cases/${this.id()}`));
  protected readonly action = new Action();
  protected readonly pending = signal<RiskAction | null>(null);

  protected readonly pageTitle = computed(() => {
    const d = this.data.value();
    return d ? `Dossier ${d.reference}` : 'Dossier de risque';
  });
  protected readonly subtitle = computed(() => {
    const d = this.data.value();
    return d ? (SIGNAL_LABELS[d.signalType] ?? d.signalType) : '';
  });
  protected readonly canAct = computed(() => this.auth.can('admin.fraud.act') && (this.data.value()?.allowedTransitions.length ?? 0) > 0);
  protected readonly pendingTitle = computed(() => RISK_ACTION_LABELS[this.pending() ?? 'NOTE'] ?? 'Action');
  protected readonly pendingMessage = computed(() => {
    const pending = this.pending();
    if (pending === 'RESOLVE') return 'Le dossier est clôturé ; la note sert de conclusion.';
    if (pending === 'FALSE_POSITIVE') return 'Le signal est classé sans suite ; le dossier est clôturé.';
    if (pending === 'ESCALATE') return 'Le dossier est signalé comme prioritaire pour une décision de la direction.';
    return 'La note est ajoutée à la chronologie du dossier et ne peut plus être modifiée.';
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.data.load());
    });
  }

  protected statusText(code: string): string {
    return statusLabel('risk', code).label;
  }

  protected ask(action: RiskAction, dialog: ActionDialogComponent): void {
    this.action.reset();
    this.pending.set(action);
    dialog.open();
  }

  protected async run(action: RiskAction, note?: string): Promise<boolean> {
    const result = await this.action.run(() =>
      this.api.post<RiskCaseDetail>(`/admin/fraud/cases/${this.id()}/actions`, { action, ...(note ? { note } : {}) }),
    );
    if (!result) return false;
    this.data.set(result);
    this.toast.success(`${RISK_ACTION_LABELS[action] ?? action} : enregistré.`);
    return true;
  }

  protected async confirm(note: string, dialog: ActionDialogComponent): Promise<void> {
    const action = this.pending();
    if (!action) return;
    if (await this.run(action, note)) {
      dialog.close();
      this.pending.set(null);
    }
  }
}
