import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Money, Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Action, Loadable, PagedList } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { PROJECT_DECISION_LABELS, PROJECT_DOCUMENT_LABELS, statusLabel, statusOptions } from '../../core/labels';
import { StaffDirectory } from '../../core/staff-directory.service';
import { ToastService } from '../../core/toast.service';
import { ActionDialogComponent } from '../../shared/action-dialog.component';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { DocumentListComponent, StoredDocument } from '../../shared/document-list.component';
import { IconComponent } from '../../shared/icon.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { FrDatePipe, FrDateTimePipe, FullNamePipe, MoneyPipe, PhonePipe } from '../../shared/pipes';
import { BadgeComponent, StatusBadgeComponent } from '../../shared/status-badge.component';

interface ProjectMember {
  userId: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
}

interface ProjectRow {
  id: string;
  title: string;
  sector: string | null;
  city: string | null;
  status: string;
  estimatedBudget: Money | null;
  grantRequested: Money | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  member: ProjectMember;
}

interface ProjectDetail extends ProjectRow {
  locationDetail: string | null;
  problem: string | null;
  solution: string | null;
  market: string | null;
  description: string | null;
  personalContribution: Money;
  budgetLines: { label: string; amount: Money }[];
  teamMembers: { fullName: string; role: string }[];
  forecasts: { monthlyRevenue: Money | null; monthlyCosts: Money | null; jobsCreated: number | null };
  reviewFeedback: string | null;
  score: number | null;
  completeness: { complete: boolean; missing: string[]; issues: string[] };
  documents: StoredDocument[];
  reviews: { decision: string; reason: string; score: number | null; createdAt: string }[];
  milestones: { id: string; title: string; targetDate: string | null; amount: Money; isCompleted: boolean; completedAt: string | null }[];
  company: { id: string; name: string; status: string } | null;
  member: ProjectMember & { kycStatus: string | null; beneficiaryStatus: string | null };
  reviewerId: string | null;
}

const MISSING_LABELS: Record<string, string> = {
  sector: 'secteur',
  city: 'ville',
  problem: 'problème',
  solution: 'solution',
  market: 'marché',
  description: 'description',
  estimatedBudget: 'budget estimé',
  grantRequested: 'subvention demandée',
  budgetLines: 'lignes de budget',
};

const ISSUE_LABELS: Record<string, string> = {
  BUDGET_LINES_MISMATCH: 'le total des lignes ne correspond pas au budget estimé',
  GRANT_ABOVE_BUDGET: 'la subvention demandée dépasse le budget',
  FINANCING_UNBALANCED: 'apport personnel et subvention ne couvrent pas exactement le budget',
};

@Component({
  selector: 'bi-projects-page',
  imports: [
    FormsModule,
    RouterLink,
    AsyncStateComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    FrDatePipe,
    FullNamePipe,
    MoneyPipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header title="Projets" subtitle="Projets d'entreprise des bénéficiaires : examen par le comité et décision motivée communiquée au porteur." />

      <section class="card">
        <div class="card-body filters">
          <div class="field">
            <label for="projects-status">Statut</label>
            <select id="projects-status" name="status" class="input" [ngModel]="status()" (ngModelChange)="status.set($event); list.reload()">
              <option value="">Tous les projets</option>
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
          emptyTitle="Aucun projet"
          emptyText="Aucun projet ne correspond à ce filtre."
          (retry)="list.reload()"
        >
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Projet</th>
                  <th>Porteur</th>
                  <th>Ville</th>
                  <th class="num">Budget</th>
                  <th class="num">Subvention demandée</th>
                  <th>Soumis le</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                @for (row of list.items(); track row.id) {
                  <tr class="clickable" (click)="open(row.id)">
                    <td>
                      <a class="cell-title" [routerLink]="['/projets', row.id]" (click)="$event.stopPropagation()">{{ row.title }}</a>
                      <div class="cell-sub">{{ row.sector ?? 'Secteur non renseigné' }}</div>
                    </td>
                    <td>
                      {{ row.member | fullName }}
                      <div class="cell-sub">{{ row.member.phone | phone }}</div>
                    </td>
                    <td>{{ row.city ?? row.member.city ?? '—' }}</td>
                    <td class="num nowrap">{{ row.estimatedBudget | xaf }}</td>
                    <td class="num nowrap">{{ row.grantRequested | xaf }}</td>
                    <td class="nowrap">{{ row.submittedAt | frDate }}</td>
                    <td><bi-status domain="project" [code]="row.status" /></td>
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
export class ProjectsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly statusChoices = statusOptions('project');
  protected readonly status = signal('SUBMITTED');
  protected readonly list = new PagedList<ProjectRow>((cursor) =>
    this.api.get<Page<ProjectRow>>('/admin/projects', { status: this.status(), cursor, limit: 25 }),
  );

  ngOnInit(): void {
    void this.list.reload();
  }

  protected open(id: string): void {
    void this.router.navigate(['/projets', id]);
  }
}

@Component({
  selector: 'bi-project-detail-page',
  imports: [
    FormsModule,
    RouterLink,
    ActionDialogComponent,
    AsyncStateComponent,
    DocumentListComponent,
    IconComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    BadgeComponent,
    FrDatePipe,
    FrDateTimePipe,
    FullNamePipe,
    MoneyPipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
  `,
  template: `
    <div class="page">
      <bi-page-header [title]="pageTitle()" subtitle="Le porteur ne peut pas modifier son projet pendant l'examen. Chaque décision est motivée et notifiée." backLink="/projets" backLabel="Projets">
        @if (data.value(); as d) {
          @if (canDecide()) {
            @if (d.status === 'SUBMITTED') {
              <button type="button" class="btn btn-secondary" [disabled]="action.busy()" (click)="startReview()">Commencer l’examen</button>
            }
            @if (d.status === 'SUBMITTED' || d.status === 'UNDER_REVIEW') {
              <button type="button" class="btn" (click)="openDecision(decisionDialog)"><bi-icon name="check" [size]="16" /> Rendre une décision</button>
            }
          }
        }
      </bi-page-header>

      <bi-async [loading]="data.loading()" [error]="data.error()" [hasContent]="!!data.value()" (retry)="data.load()">
        @if (data.value(); as d) {
          <div class="stack">
            @if (action.error() && !decisionOpen()) {
              <div class="alert alert-danger" role="alert">{{ action.error() }}</div>
            }
            @if (!d.completeness.complete) {
              <div class="alert alert-warning">
                <bi-icon name="alert" [size]="18" />
                <div>
                  @if (d.completeness.missing.length > 0) {
                    <div>Informations manquantes : {{ missingText(d.completeness.missing) }}.</div>
                  }
                  @if (d.completeness.issues.length > 0) {
                    <div>Incohérences : {{ issuesText(d.completeness.issues) }}.</div>
                  }
                </div>
              </div>
            }

            <div class="grid grid-main-side">
              <div class="stack">
                <section class="card">
                  <div class="card-header">
                    <h3>Présentation</h3>
                    <bi-status domain="project" [code]="d.status" />
                  </div>
                  <div class="card-body stack">
                    <dl class="dl">
                      <dt>Secteur</dt>
                      <dd>{{ d.sector ?? '—' }}</dd>
                      <dt>Localisation</dt>
                      <dd>{{ d.city ?? '—' }}{{ d.locationDetail ? ' · ' + d.locationDetail : '' }}</dd>
                    </dl>
                    @for (block of textBlocks(d); track block.label) {
                      <div>
                        <div class="section-title">{{ block.label }}</div>
                        <p class="pre-line break">{{ block.value ?? 'Non renseigné.' }}</p>
                      </div>
                    }
                  </div>
                </section>

                <section class="card">
                  <div class="card-header"><h3>Budget et financement</h3></div>
                  <div class="card-body stack">
                    <div class="grid grid-3">
                      <div>
                        <div class="kpi-label">Budget estimé</div>
                        <div class="strong">{{ d.estimatedBudget | xaf }}</div>
                      </div>
                      <div>
                        <div class="kpi-label">Apport personnel</div>
                        <div class="strong">{{ d.personalContribution | xaf }}</div>
                      </div>
                      <div>
                        <div class="kpi-label">Subvention demandée</div>
                        <div class="strong">{{ d.grantRequested | xaf }}</div>
                      </div>
                    </div>
                    <div class="table-wrap">
                      <table class="table">
                        <thead>
                          <tr>
                            <th>Poste de dépense</th>
                            <th class="num">Montant</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (line of d.budgetLines; track $index) {
                            <tr>
                              <td>{{ line.label }}</td>
                              <td class="num nowrap">{{ line.amount | xaf }}</td>
                            </tr>
                          } @empty {
                            <tr>
                              <td colspan="2" class="muted">Aucune ligne de budget.</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                    <dl class="dl">
                      <dt>Chiffre d’affaires mensuel prévu</dt>
                      <dd>{{ d.forecasts.monthlyRevenue | xaf }}</dd>
                      <dt>Charges mensuelles prévues</dt>
                      <dd>{{ d.forecasts.monthlyCosts | xaf }}</dd>
                      <dt>Emplois créés</dt>
                      <dd>{{ d.forecasts.jobsCreated ?? '—' }}</dd>
                    </dl>
                  </div>
                </section>

                <div class="grid grid-2">
                  <section class="card">
                    <div class="card-header"><h3>Équipe</h3></div>
                    <div class="card-body">
                      @for (member of d.teamMembers; track $index) {
                        <div class="row-nowrap" style="padding: 4px 0">
                          <span class="spacer strong">{{ member.fullName }}</span>
                          <span class="muted small">{{ member.role }}</span>
                        </div>
                      } @empty {
                        <p class="muted small">Le porteur travaille seul.</p>
                      }
                    </div>
                  </section>
                  <section class="card">
                    <div class="card-header"><h3>Documents</h3></div>
                    <div class="card-body"><bi-document-list [documents]="d.documents" [labels]="documentLabels" /></div>
                  </section>
                </div>

                @if (d.milestones.length > 0) {
                  <section class="card">
                    <div class="card-header"><h3>Jalons de financement</h3></div>
                    <div class="table-wrap">
                      <table class="table">
                        <thead>
                          <tr>
                            <th>Jalon</th>
                            <th>Échéance</th>
                            <th class="num">Montant</th>
                            <th>État</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (milestone of d.milestones; track milestone.id) {
                            <tr>
                              <td>{{ milestone.title }}</td>
                              <td class="nowrap">{{ milestone.targetDate | frDate }}</td>
                              <td class="num nowrap">{{ milestone.amount | xaf }}</td>
                              <td>
                                @if (milestone.isCompleted) {
                                  <bi-badge tone="success">Atteint le {{ milestone.completedAt | frDate }}</bi-badge>
                                } @else {
                                  <bi-badge>À venir</bi-badge>
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

              <div class="stack">
                <section class="card">
                  <div class="card-header"><h3>Porteur</h3></div>
                  <div class="card-body">
                    <dl class="dl">
                      <dt>Nom</dt>
                      <dd>
                        @if (auth.can('admin.drivers.read')) {
                          <a [routerLink]="['/conducteurs', d.member.userId]">{{ d.member | fullName }}</a>
                        } @else {
                          {{ d.member | fullName }}
                        }
                      </dd>
                      <dt>Téléphone</dt>
                      <dd>{{ d.member.phone | phone }}</dd>
                      <dt>Ville</dt>
                      <dd>{{ d.member.city ?? '—' }}</dd>
                      <dt>Identité</dt>
                      <dd><bi-status domain="kyc" [code]="d.member.kycStatus" /></dd>
                      <dt>Parcours</dt>
                      <dd>
                        @if (d.member.beneficiaryStatus) {
                          <bi-status domain="beneficiary" [code]="d.member.beneficiaryStatus" />
                        } @else {
                          Non bénéficiaire
                        }
                      </dd>
                    </dl>
                  </div>
                </section>

                <section class="card">
                  <div class="card-header"><h3>Examen</h3></div>
                  <div class="card-body">
                    <dl class="dl">
                      <dt>Soumis le</dt>
                      <dd>{{ d.submittedAt | frDateTime }}</dd>
                      <dt>Examinateur</dt>
                      <dd>{{ staff.name(d.reviewerId) }}</dd>
                      <dt>Score</dt>
                      <dd>{{ d.score === null ? '—' : d.score + ' / 100' }}</dd>
                      @if (d.reviewFeedback) {
                        <dt>Dernier retour</dt>
                        <dd class="pre-line">{{ d.reviewFeedback }}</dd>
                      }
                      @if (d.company; as company) {
                        <dt>Entreprise</dt>
                        <dd>
                          @if (auth.can('admin.companies.read')) {
                            <a [routerLink]="['/entreprises', company.id]">{{ company.name }}</a>
                          } @else {
                            {{ company.name }}
                          }
                        </dd>
                      }
                    </dl>
                  </div>
                </section>

                <section class="card">
                  <div class="card-header"><h3>Décisions</h3></div>
                  <div class="card-body">
                    <ul class="timeline">
                      @for (review of d.reviews; track $index) {
                        <li>
                          <div class="strong">{{ statusText(review.decision) }}</div>
                          <div class="small muted">{{ review.createdAt | frDateTime }}{{ review.score === null ? '' : ' · score ' + review.score + ' / 100' }}</div>
                          <p class="small pre-line">{{ review.reason }}</p>
                        </li>
                      } @empty {
                        <p class="muted small">Aucune décision rendue.</p>
                      }
                    </ul>
                  </div>
                </section>
              </div>
            </div>
          </div>
        }
      </bi-async>

      <bi-action-dialog
        #decisionDialog
        title="Décision du comité"
        message="Le porteur est notifié avec votre motif. Une demande de corrections lui permet de modifier puis de soumettre à nouveau son projet."
        confirmLabel="Enregistrer la décision"
        [tone]="decision() === 'APPROVED' ? 'success' : decision() === 'REJECTED' ? 'danger' : 'primary'"
        reasonLabel="Motif communiqué au porteur"
        [valid]="scoreValid()"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="decide($event, decisionDialog)"
      >
        <div class="grid grid-2">
          <div class="field">
            <label for="project-decision">Décision</label>
            <select id="project-decision" name="projectDecision" class="input" [ngModel]="decision()" (ngModelChange)="decision.set($event)">
              @for (option of decisionChoices; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="project-score">Score sur 100 (facultatif)</label>
            <input id="project-score" name="projectScore" type="number" min="0" max="100" class="input" [ngModel]="score()" (ngModelChange)="score.set($event)" />
          </div>
        </div>
      </bi-action-dialog>
    </div>
  `,
})
export class ProjectDetailPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthStore);
  protected readonly staff = inject(StaffDirectory);

  readonly id = input.required<string>();

  protected readonly documentLabels = PROJECT_DOCUMENT_LABELS;
  protected readonly decisionChoices = Object.entries(PROJECT_DECISION_LABELS).map(([value, label]) => ({ value, label }));
  protected readonly data = new Loadable(() => this.api.get<ProjectDetail>(`/admin/projects/${this.id()}`));
  protected readonly action = new Action();
  protected readonly decision = signal('APPROVED');
  protected readonly score = signal<number | null>(null);
  protected readonly decisionOpen = signal(false);

  protected readonly pageTitle = computed(() => this.data.value()?.title ?? 'Projet');
  protected readonly canDecide = computed(() => this.auth.can('admin.projects.decide'));
  protected readonly scoreValid = computed(() => {
    const score = this.score();
    return score === null || (Number.isInteger(score) && score >= 0 && score <= 100);
  });

  constructor() {
    this.staff.ensureLoaded();
    effect(() => {
      this.id();
      untracked(() => void this.data.load());
    });
  }

  protected textBlocks(d: ProjectDetail): { label: string; value: string | null }[] {
    return [
      { label: 'Problème identifié', value: d.problem },
      { label: 'Solution proposée', value: d.solution },
      { label: 'Marché et clientèle', value: d.market },
      { label: 'Description du projet', value: d.description },
    ];
  }

  protected missingText(codes: string[]): string {
    return codes.map((code) => MISSING_LABELS[code] ?? code).join(', ');
  }

  protected issuesText(codes: string[]): string {
    return codes.map((code) => ISSUE_LABELS[code] ?? code).join(' ; ');
  }

  protected statusText(decision: string): string {
    return statusLabel('project', decision).label;
  }

  protected async startReview(): Promise<void> {
    this.decisionOpen.set(false);
    const result = await this.action.run(() => this.api.post<ProjectDetail>(`/admin/projects/${this.id()}/review`));
    if (!result) return;
    this.data.set(result);
    this.toast.success('Examen commencé : vous êtes l’examinateur du projet.');
  }

  protected openDecision(dialog: ActionDialogComponent): void {
    this.action.reset();
    this.decision.set('APPROVED');
    this.score.set(this.data.value()?.score ?? null);
    this.decisionOpen.set(true);
    dialog.open();
  }

  protected async decide(reason: string, dialog: ActionDialogComponent): Promise<void> {
    const score = this.score();
    const result = await this.action.run(() =>
      this.api.post<ProjectDetail>(`/admin/projects/${this.id()}/decision`, {
        decision: this.decision(),
        reason,
        ...(score !== null ? { score } : {}),
      }),
    );
    if (!result) return;
    this.data.set(result);
    this.decisionOpen.set(false);
    dialog.close();
    this.toast.success('Décision enregistrée : le porteur est notifié.');
  }
}
