import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Action, Loadable, PagedList } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { dayKey, localDateTime } from '../../core/format';
import { statusOptions } from '../../core/labels';
import { StaffDirectory } from '../../core/staff-directory.service';
import { ToastService } from '../../core/toast.service';
import { isIntegerBetween } from '../../core/validation';
import { ActionDialogComponent } from '../../shared/action-dialog.component';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { FrDateTimePipe, FullNamePipe, PhonePipe } from '../../shared/pipes';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

interface DrawView {
  id: string;
  code: string;
  title: string;
  status: string;
  scheduledAt: string;
  winnerCount: number;
  minPaidDays: number;
  windowDays: number;
  eligibleCount: number | null;
  snapshotAt: string | null;
  snapshotHash: string | null;
  seedCommitment: string | null;
  executedAt: string | null;
  publishedAt: string | null;
  cancelledAt: string | null;
  resultHash: string | null;
  seedRevealed: string | null;
  cancelReason: string | null;
  createdById: string | null;
  frozenById: string | null;
  executedById: string | null;
  publishedById: string | null;
}

interface DrawDetail extends DrawView {
  winners: {
    rank: number;
    participantToken: string;
    paidDays: number;
    member: { userId: string; phone: string; firstName: string | null; lastName: string | null; city: string | null };
  }[];
}

@Component({
  selector: 'bi-draws-page',
  imports: [
    FormsModule,
    RouterLink,
    ActionDialogComponent,
    AsyncStateComponent,
    IconComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    FrDateTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header
        title="Tirages"
        subtitle="Tirages sécurisés : liste des éligibles figée, graine engagée avant exécution, publication validée par un second administrateur et vérifiable par tous."
      >
        <button type="button" class="btn" (click)="openCreate(createDialog)"><bi-icon name="plus" [size]="16" /> Nouveau tirage</button>
      </bi-page-header>

      <section class="card">
        <div class="card-body filters">
          <div class="field">
            <label for="draws-status">Statut</label>
            <select id="draws-status" name="status" class="input" [ngModel]="status()" (ngModelChange)="status.set($event); list.reload()">
              <option value="">Tous les tirages</option>
              @for (option of statusChoices; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>
        </div>
        <bi-async
          [loading]="list.loading()"
          [error]="list.loaded() ? null : list.error()"
          [empty]="list.loaded() && list.items().length === 0"
          [hasContent]="list.items().length > 0"
          emptyTitle="Aucun tirage"
          emptyText="Créez le premier tirage du programme."
          (retry)="list.reload()"
        >
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Tirage</th>
                  <th>Prévu le</th>
                  <th class="num">Gagnants</th>
                  <th>Règle d’éligibilité</th>
                  <th class="num">Éligibles</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                @for (row of list.items(); track row.id) {
                  <tr class="clickable" (click)="open(row.id)">
                    <td>
                      <a class="cell-title" [routerLink]="['/tirages', row.id]" (click)="$event.stopPropagation()">{{ row.title }}</a>
                      <div class="cell-sub mono">{{ row.code }}</div>
                    </td>
                    <td class="nowrap">{{ row.scheduledAt | frDateTime }}</td>
                    <td class="num">{{ row.winnerCount }}</td>
                    <td>{{ row.minPaidDays }} jours payés sur {{ row.windowDays }}</td>
                    <td class="num">{{ row.eligibleCount ?? '—' }}</td>
                    <td><bi-status domain="draw" [code]="row.status" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <bi-load-more [list]="list" />
        </bi-async>
      </section>

      <bi-action-dialog
        #createDialog
        title="Nouveau tirage"
        message="Le tirage est créé en préparation. La liste des éligibles ne sera figée qu'à votre demande."
        confirmLabel="Créer le tirage"
        [valid]="!createIssue()"
        [busy]="create.busy()"
        [error]="create.error()"
        (confirmed)="createDraw(createDialog)"
      >
        <div class="field">
          <label for="draw-title">Titre</label>
          <input id="draw-title" name="drawTitle" class="input" maxlength="120" placeholder="Ex. Tirage d’octobre 2026" [ngModel]="title()" (ngModelChange)="title.set($event)" />
        </div>
        <div class="grid grid-2">
          <div class="field">
            <label for="draw-date">Date et heure (Cameroun)</label>
            <input id="draw-date" name="drawDate" type="datetime-local" class="input" [ngModel]="scheduledAt()" (ngModelChange)="scheduledAt.set($event)" />
          </div>
          <div class="field">
            <label for="draw-winners">Nombre de gagnants</label>
            <input id="draw-winners" name="drawWinners" type="number" min="1" max="1000" class="input" [ngModel]="winnerCount()" (ngModelChange)="winnerCount.set($event)" />
          </div>
          <div class="field">
            <label for="draw-min">Jours payés minimum</label>
            <input id="draw-min" name="drawMin" type="number" min="1" max="365" class="input" placeholder="Règle par défaut" [ngModel]="minPaidDays()" (ngModelChange)="minPaidDays.set($event)" />
          </div>
          <div class="field">
            <label for="draw-window">Période observée (jours)</label>
            <input id="draw-window" name="drawWindow" type="number" min="1" max="365" class="input" placeholder="Règle par défaut" [ngModel]="windowDays()" (ngModelChange)="windowDays.set($event)" />
          </div>
        </div>
        @if (createIssue(); as issue) {
          <p class="hint">{{ issue }}</p>
        }
      </bi-action-dialog>
    </div>
  `,
})
export class DrawsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly statusChoices = statusOptions('draw');
  protected readonly status = signal('');
  protected readonly list = new PagedList<DrawView>((cursor) =>
    this.api.get<Page<DrawView>>('/admin/draws', { status: this.status(), cursor, limit: 25 }),
  );

  protected readonly create = new Action();
  protected readonly title = signal('');
  protected readonly scheduledAt = signal('');
  protected readonly winnerCount = signal<number | null>(10);
  protected readonly minPaidDays = signal<number | null>(null);
  protected readonly windowDays = signal<number | null>(null);

  protected readonly createIssue = computed(() => {
    const title = this.title().trim();
    if (title.length < 5) return 'Le titre doit contenir au moins 5 caractères.';
    const scheduled = this.scheduledAt();
    if (!scheduled || Date.parse(localDateTime(scheduled)) <= Date.now()) return 'Choisissez une date future.';
    if (!isIntegerBetween(this.winnerCount(), 1, 1000)) return 'Le nombre de gagnants doit être compris entre 1 et 1000.';
    const min = this.minPaidDays();
    const window = this.windowDays();
    if (min !== null && !isIntegerBetween(min, 1, 365)) return 'Les jours payés minimum doivent être compris entre 1 et 365.';
    if (window !== null && !isIntegerBetween(window, 1, 365)) return 'La période observée doit être comprise entre 1 et 365 jours.';
    if (min !== null && window !== null && min > window) return 'Les jours requis ne peuvent pas dépasser la période observée.';
    return null;
  });

  ngOnInit(): void {
    void this.list.reload();
  }

  protected open(id: string): void {
    void this.router.navigate(['/tirages', id]);
  }

  protected openCreate(dialog: ActionDialogComponent): void {
    this.create.reset();
    this.title.set('');
    this.scheduledAt.set(`${dayKey(7)}T10:00`);
    this.winnerCount.set(10);
    this.minPaidDays.set(null);
    this.windowDays.set(null);
    dialog.open();
  }

  protected async createDraw(dialog: ActionDialogComponent): Promise<void> {
    if (this.createIssue()) return;
    const body = {
      title: this.title().trim(),
      scheduledAt: localDateTime(this.scheduledAt()),
      winnerCount: this.winnerCount(),
      ...(this.minPaidDays() !== null ? { minPaidDays: this.minPaidDays() } : {}),
      ...(this.windowDays() !== null ? { windowDays: this.windowDays() } : {}),
    };
    const draw = await this.create.run(() => this.api.post<DrawView>('/admin/draws', body));
    if (!draw) return;
    dialog.close();
    this.toast.success(`Tirage ${draw.code} créé.`);
    void this.router.navigate(['/tirages', draw.id]);
  }
}

const STEPS = [
  { code: 'DRAFT', label: 'Préparation' },
  { code: 'FROZEN', label: 'Liste figée' },
  { code: 'EXECUTED', label: 'Exécuté' },
  { code: 'PUBLISHED', label: 'Publié' },
];

@Component({
  selector: 'bi-draw-detail-page',
  imports: [
    RouterLink,
    ActionDialogComponent,
    AsyncStateComponent,
    IconComponent,
    PageHeaderComponent,
    FrDateTimePipe,
    FullNamePipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .steps {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .step {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: 999px;
      background: var(--neutral-100);
      color: var(--text-muted);
      font-weight: 600;
      font-size: 13px;
    }
    .step.done {
      background: var(--growth-50);
      color: var(--growth-700);
    }
    .step.current {
      background: var(--primary-50);
      color: var(--primary-700);
      box-shadow: inset 0 0 0 1px var(--primary-200);
    }
    .hash {
      font-family: var(--mono);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
  `,
  template: `
    <div class="page">
      <bi-page-header [title]="pageTitle()" [subtitle]="subtitle()" backLink="/tirages" backLabel="Tirages">
        @if (data.value(); as d) {
          @if (d.status === 'DRAFT') {
            <button type="button" class="btn" (click)="action.reset(); freezeDialog.open()"><bi-icon name="lock" [size]="16" /> Figer la liste</button>
          }
          @if (d.status === 'FROZEN' && auth.can('admin.draws.execute')) {
            <button type="button" class="btn" (click)="action.reset(); executeDialog.open()"><bi-icon name="draw" [size]="16" /> Exécuter le tirage</button>
          }
          @if (d.status === 'EXECUTED' && auth.can('admin.draws.publish')) {
            <button type="button" class="btn btn-success" [disabled]="executedByMe()" (click)="action.reset(); publishDialog.open()">
              <bi-icon name="check" [size]="16" /> Publier les résultats
            </button>
          }
          @if (d.status === 'DRAFT' || d.status === 'FROZEN') {
            <button type="button" class="btn btn-secondary" (click)="action.reset(); cancelDialog.open()">Annuler le tirage</button>
          }
          @if (auth.can('admin.audit.read')) {
            <a class="btn btn-ghost" routerLink="/audit" [queryParams]="{ resourceType: 'draw', resourceId: d.id }"><bi-icon name="history" [size]="16" /> Journal</a>
          }
        }
      </bi-page-header>

      <bi-async [loading]="data.loading()" [error]="data.error()" [hasContent]="!!data.value()" (retry)="data.load()">
        @if (data.value(); as d) {
          <div class="stack">
            @if (d.status === 'CANCELLED') {
              <div class="alert alert-warning">
                <bi-icon name="x" [size]="18" />
                <div>Tirage annulé le {{ d.cancelledAt | frDateTime }}. Motif : {{ d.cancelReason ?? '—' }}</div>
              </div>
            } @else {
              <div class="steps" aria-label="Étapes du tirage">
                @for (step of steps; track step.code) {
                  <span class="step" [class.done]="stepState(step.code, d.status) === 'done'" [class.current]="stepState(step.code, d.status) === 'current'">
                    @if (stepState(step.code, d.status) === 'done') {
                      <bi-icon name="check" [size]="14" />
                    }
                    {{ step.label }}
                  </span>
                }
              </div>
            }
            @if (d.status === 'EXECUTED') {
              <div class="alert alert-warning">
                <bi-icon name="lock" [size]="18" />
                <div>
                  Résultats confidentiels jusqu’à leur publication.
                  @if (executedByMe()) {
                    Vous avez exécuté ce tirage : la publication doit être validée par un autre administrateur.
                  }
                </div>
              </div>
            }

            <div class="grid grid-main-side">
              <div class="stack">
                <section class="card">
                  <div class="card-header"><h3>Paramètres</h3></div>
                  <div class="card-body">
                    <dl class="dl">
                      <dt>Code</dt>
                      <dd class="mono">{{ d.code }}</dd>
                      <dt>Prévu le</dt>
                      <dd>{{ d.scheduledAt | frDateTime }}</dd>
                      <dt>Gagnants</dt>
                      <dd>{{ d.winnerCount }}</dd>
                      <dt>Éligibilité</dt>
                      <dd>Identité vérifiée, au moins {{ d.minPaidDays }} jours de contribution payés sur les {{ d.windowDays }} derniers jours, pas déjà bénéficiaire</dd>
                      <dt>Éligibles figés</dt>
                      <dd>{{ d.eligibleCount ?? '—' }}{{ d.snapshotAt ? ' le ' : '' }}{{ d.snapshotAt ? (d.snapshotAt | frDateTime) : '' }}</dd>
                    </dl>
                  </div>
                </section>

                @if (d.winners.length > 0) {
                  <section class="card">
                    <div class="card-header">
                      <h3>Gagnants</h3>
                      <span class="muted small">{{ d.status === 'PUBLISHED' ? 'Publiés le ' + (d.publishedAt | frDateTime) : 'Confidentiel' }}</span>
                    </div>
                    <div class="table-wrap">
                      <table class="table">
                        <thead>
                          <tr>
                            <th class="num">Rang</th>
                            <th>Membre</th>
                            <th>Ville</th>
                            <th class="num">Jours payés</th>
                            <th>Jeton anonyme</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (winner of d.winners; track winner.rank) {
                            <tr>
                              <td class="num strong">{{ winner.rank }}</td>
                              <td>
                                @if (auth.can('admin.drivers.read')) {
                                  <a [routerLink]="['/conducteurs', winner.member.userId]">{{ winner.member | fullName }}</a>
                                } @else {
                                  {{ winner.member | fullName }}
                                }
                                <div class="cell-sub">{{ winner.member.phone | phone }}</div>
                              </td>
                              <td>{{ winner.member.city ?? '—' }}</td>
                              <td class="num">{{ winner.paidDays }}</td>
                              <td class="mono">{{ winner.participantToken.slice(0, 16) }}…</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  </section>
                }
              </div>

              <div class="stack">
                <section class="card">
                  <div class="card-header"><h3>Traçabilité</h3></div>
                  <div class="card-body">
                    <dl class="dl">
                      <dt>Créé par</dt>
                      <dd>{{ staff.name(d.createdById) }}</dd>
                      <dt>Figé par</dt>
                      <dd>{{ staff.name(d.frozenById) }}</dd>
                      <dt>Exécuté par</dt>
                      <dd>{{ staff.name(d.executedById) }}{{ d.executedAt ? ' · ' : '' }}{{ d.executedAt ? (d.executedAt | frDateTime) : '' }}</dd>
                      <dt>Publié par</dt>
                      <dd>{{ staff.name(d.publishedById) }}{{ d.publishedAt ? ' · ' : '' }}{{ d.publishedAt ? (d.publishedAt | frDateTime) : '' }}</dd>
                    </dl>
                  </div>
                </section>
                <section class="card">
                  <div class="card-header"><h3>Intégrité</h3></div>
                  <div class="card-body stack-sm">
                    <div>
                      <div class="eyebrow">Empreinte de la liste</div>
                      <div class="hash">{{ d.snapshotHash ?? '—' }}</div>
                    </div>
                    <div>
                      <div class="eyebrow">Engagement de la graine</div>
                      <div class="hash">{{ d.seedCommitment ?? '—' }}</div>
                    </div>
                    <div>
                      <div class="eyebrow">Empreinte du résultat</div>
                      <div class="hash">{{ d.resultHash ?? '—' }}</div>
                    </div>
                    <div>
                      <div class="eyebrow">Graine révélée</div>
                      <div class="hash">{{ d.seedRevealed ?? 'Révélée à la publication' }}</div>
                    </div>
                    @if (d.status !== 'DRAFT' && d.status !== 'CANCELLED') {
                      <a class="btn btn-secondary btn-sm" [href]="auditUrl(d.id)" target="_blank" rel="noopener">
                        <bi-icon name="external" [size]="14" /> Rapport de vérification public
                      </a>
                    }
                  </div>
                </section>
              </div>
            </div>
          </div>
        }
      </bi-async>

      <bi-action-dialog
        #freezeDialog
        title="Figer la liste des éligibles"
        message="Les membres remplissant les conditions à cet instant sont enregistrés et notifiés, puis une graine secrète est générée et engagée par son empreinte. Cette étape est irréversible."
        confirmLabel="Figer la liste"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="transition('freeze', freezeDialog)"
      />
      <bi-action-dialog
        #executeDialog
        title="Exécuter le tirage"
        message="Les participants sont classés selon la graine engagée. Les résultats restent confidentiels jusqu'à leur publication par un autre administrateur."
        confirmLabel="Exécuter"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="transition('execute', executeDialog)"
      />
      <bi-action-dialog
        #publishDialog
        title="Publier les résultats"
        message="La graine est révélée, les gagnants deviennent bénéficiaires et tous les participants sont notifiés. Cette action est irréversible."
        confirmLabel="Publier"
        tone="success"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="transition('publish', publishDialog)"
      />
      <bi-action-dialog
        #cancelDialog
        title="Annuler le tirage"
        message="Un tirage annulé ne peut pas être repris : créez-en un nouveau si nécessaire."
        confirmLabel="Annuler le tirage"
        tone="danger"
        reasonLabel="Motif de l'annulation"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="cancel($event, cancelDialog)"
      />
    </div>
  `,
})
export class DrawDetailPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthStore);
  protected readonly staff = inject(StaffDirectory);

  readonly id = input.required<string>();

  protected readonly steps = STEPS;
  protected readonly data = new Loadable(() => this.api.get<DrawDetail>(`/admin/draws/${this.id()}`));
  protected readonly action = new Action();

  protected readonly pageTitle = computed(() => this.data.value()?.title ?? 'Tirage');
  protected readonly subtitle = computed(() => {
    const d = this.data.value();
    return d ? `${d.code} · prévu le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Douala' }).format(new Date(d.scheduledAt))}` : '';
  });
  protected readonly executedByMe = computed(() => {
    const d = this.data.value();
    return !!d?.executedById && d.executedById === this.auth.user()?.id;
  });

  constructor() {
    this.staff.ensureLoaded();
    effect(() => {
      this.id();
      untracked(() => void this.data.load());
    });
  }

  protected stepState(code: string, status: string): 'done' | 'current' | 'todo' {
    const index = STEPS.findIndex((step) => step.code === code);
    const current = STEPS.findIndex((step) => step.code === status);
    if (status === 'PUBLISHED' || index < current) return 'done';
    return index === current ? 'current' : 'todo';
  }

  protected auditUrl(id: string): string {
    return `${this.api.baseUrl}/draws/${id}/audit`;
  }

  protected async transition(step: 'freeze' | 'execute' | 'publish', dialog: ActionDialogComponent): Promise<void> {
    const result = await this.action.run(() => this.api.post(`/admin/draws/${this.id()}/${step}`));
    if (result === undefined) return;
    dialog.close();
    const messages = {
      freeze: 'Liste figée : les participants sont notifiés.',
      execute: 'Tirage exécuté. Un autre administrateur doit maintenant publier les résultats.',
      publish: 'Résultats publiés : les bénéficiaires sont créés et notifiés.',
    };
    this.toast.success(messages[step]);
    await this.data.load();
  }

  protected async cancel(reason: string, dialog: ActionDialogComponent): Promise<void> {
    const result = await this.action.run(() => this.api.post(`/admin/draws/${this.id()}/cancel`, { reason }));
    if (result === undefined) return;
    dialog.close();
    this.toast.success('Tirage annulé.');
    await this.data.load();
  }
}
