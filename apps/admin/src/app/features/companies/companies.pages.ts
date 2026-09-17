import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Action, Loadable, PagedList } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { statusOptions } from '../../core/labels';
import { ToastService } from '../../core/toast.service';
import { ActionDialogComponent } from '../../shared/action-dialog.component';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { FrDatePipe, PhonePipe } from '../../shared/pipes';
import { BadgeComponent, StatusBadgeComponent } from '../../shared/status-badge.component';

interface CompanyOwner {
  userId: string;
  name: string | null;
  phone: string;
}

interface CompanyRow {
  id: string;
  name: string;
  sector: string | null;
  city: string | null;
  status: string;
  createdAt: string;
  owner: CompanyOwner;
  membersCount: number;
  openJobsCount: number;
}

interface CompanyDetail {
  id: string;
  name: string;
  sector: string | null;
  city: string | null;
  description: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  owner: CompanyOwner;
  project: { id: string; title: string; status: string } | null;
  performance: { activeMembers: number; jobsPublished: number; openJobs: number; applications: number; hires: number };
  members: { id: string; fullName: string; role: string; joinedAt: string; leftAt: string | null; userId: string | null }[];
  jobs: {
    id: string;
    title: string;
    location: string;
    slots: number;
    isActive: boolean;
    createdAt: string;
    closedAt: string | null;
    applications: number;
  }[];
}

@Component({
  selector: 'bi-companies-page',
  imports: [
    FormsModule,
    RouterLink,
    AsyncStateComponent,
    IconComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    FrDatePipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header title="Entreprises" subtitle="Entreprises créées par les bénéficiaires : équipe, offres d'emploi et recrutements." />

      <section class="card">
        <form class="card-body filters" (submit)="$event.preventDefault(); list.reload()">
          <div class="field">
            <label for="companies-q">Recherche</label>
            <input id="companies-q" name="q" class="input" placeholder="Nom, ville ou secteur" [ngModel]="q()" (ngModelChange)="q.set($event)" />
          </div>
          <div class="field">
            <label for="companies-status">Statut</label>
            <select id="companies-status" name="status" class="input" [ngModel]="status()" (ngModelChange)="status.set($event); list.reload()">
              <option value="">Tous</option>
              @for (option of statusChoices; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>
          <button type="submit" class="btn btn-secondary"><bi-icon name="search" [size]="16" /> Rechercher</button>
        </form>
        <bi-async
          [loading]="list.loading()"
          [error]="list.loaded() ? null : list.error()"
          [empty]="list.loaded() && list.items().length === 0"
          [hasContent]="list.items().length > 0"
          emptyTitle="Aucune entreprise"
          emptyText="Aucune entreprise ne correspond à ces critères."
          (retry)="list.reload()"
        >
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Entreprise</th>
                  <th>Ville</th>
                  <th>Propriétaire</th>
                  <th class="num">Membres</th>
                  <th class="num">Offres ouvertes</th>
                  <th>Créée le</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                @for (row of list.items(); track row.id) {
                  <tr class="clickable" (click)="open(row.id)">
                    <td>
                      <a class="cell-title" [routerLink]="['/entreprises', row.id]" (click)="$event.stopPropagation()">{{ row.name }}</a>
                      <div class="cell-sub">{{ row.sector ?? 'Secteur non renseigné' }}</div>
                    </td>
                    <td>{{ row.city ?? '—' }}</td>
                    <td>
                      {{ row.owner.name ?? 'Nom non renseigné' }}
                      <div class="cell-sub">{{ row.owner.phone | phone }}</div>
                    </td>
                    <td class="num">{{ row.membersCount }}</td>
                    <td class="num">{{ row.openJobsCount }}</td>
                    <td class="nowrap">{{ row.createdAt | frDate }}</td>
                    <td><bi-status domain="company" [code]="row.status" /></td>
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
export class CompaniesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly statusChoices = statusOptions('company');
  protected readonly q = signal('');
  protected readonly status = signal('');
  protected readonly list = new PagedList<CompanyRow>((cursor) =>
    this.api.get<Page<CompanyRow>>('/admin/companies', { q: this.q().trim(), status: this.status(), cursor, limit: 25 }),
  );

  ngOnInit(): void {
    void this.list.reload();
  }

  protected open(id: string): void {
    void this.router.navigate(['/entreprises', id]);
  }
}

@Component({
  selector: 'bi-company-detail-page',
  imports: [
    RouterLink,
    ActionDialogComponent,
    AsyncStateComponent,
    IconComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    BadgeComponent,
    FrDatePipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header [title]="pageTitle()" [subtitle]="subtitle()" backLink="/entreprises" backLabel="Entreprises">
        @if (data.value(); as d) {
          @if (auth.can('admin.companies.manage')) {
            @if (d.status === 'ACTIVE') {
              <button type="button" class="btn btn-danger" (click)="action.reset(); suspendDialog.open()"><bi-icon name="x" [size]="16" /> Suspendre</button>
            }
            @if (d.status === 'SUSPENDED') {
              <button type="button" class="btn btn-success" (click)="action.reset(); activateDialog.open()"><bi-icon name="check" [size]="16" /> Réactiver</button>
            }
          }
        }
      </bi-page-header>

      <bi-async [loading]="data.loading()" [error]="data.error()" [hasContent]="!!data.value()" (retry)="data.load()">
        @if (data.value(); as d) {
          <div class="stack">
            <div class="grid grid-4">
              <div class="card kpi">
                <span class="kpi-label">Membres actifs</span>
                <span class="kpi-value">{{ d.performance.activeMembers }}</span>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Offres publiées</span>
                <span class="kpi-value">{{ d.performance.jobsPublished }}</span>
                <span class="kpi-sub">{{ d.performance.openJobs }} ouverte(s)</span>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Candidatures reçues</span>
                <span class="kpi-value">{{ d.performance.applications }}</span>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Recrutements</span>
                <span class="kpi-value">{{ d.performance.hires }}</span>
              </div>
            </div>

            <div class="grid grid-main-side">
              <div class="stack">
                <section class="card">
                  <div class="card-header"><h3>Offres d’emploi</h3></div>
                  <div class="table-wrap">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Offre</th>
                          <th class="num">Postes</th>
                          <th class="num">Candidatures</th>
                          <th>Publiée le</th>
                          <th>État</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (job of d.jobs; track job.id) {
                          <tr>
                            <td>
                              @if (auth.can('admin.recruitment.read')) {
                                <a class="cell-title" [routerLink]="['/recrutement', job.id]">{{ job.title }}</a>
                              } @else {
                                <span class="cell-title">{{ job.title }}</span>
                              }
                              <div class="cell-sub">{{ job.location }}</div>
                            </td>
                            <td class="num">{{ job.slots }}</td>
                            <td class="num">{{ job.applications }}</td>
                            <td class="nowrap">{{ job.createdAt | frDate }}</td>
                            <td>
                              @if (job.isActive) {
                                <bi-badge tone="success">Ouverte</bi-badge>
                              } @else {
                                <bi-badge>Fermée le {{ job.closedAt | frDate }}</bi-badge>
                              }
                            </td>
                          </tr>
                        } @empty {
                          <tr>
                            <td colspan="5" class="muted">Aucune offre publiée.</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </section>

                <section class="card">
                  <div class="card-header"><h3>Équipe</h3></div>
                  <div class="table-wrap">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Nom</th>
                          <th>Rôle</th>
                          <th>Arrivée</th>
                          <th>Départ</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (member of d.members; track member.id) {
                          <tr>
                            <td>
                              @if (member.userId && auth.can('admin.drivers.read')) {
                                <a [routerLink]="['/conducteurs', member.userId]">{{ member.fullName }}</a>
                              } @else {
                                {{ member.fullName }}
                              }
                            </td>
                            <td>{{ member.role }}</td>
                            <td class="nowrap">{{ member.joinedAt | frDate }}</td>
                            <td class="nowrap">{{ member.leftAt | frDate }}</td>
                          </tr>
                        } @empty {
                          <tr>
                            <td colspan="4" class="muted">Aucun membre déclaré.</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              <section class="card">
                <div class="card-header">
                  <h3>Informations</h3>
                  <bi-status domain="company" [code]="d.status" />
                </div>
                <div class="card-body stack-sm">
                  <dl class="dl">
                    <dt>Secteur</dt>
                    <dd>{{ d.sector ?? '—' }}</dd>
                    <dt>Ville</dt>
                    <dd>{{ d.city ?? '—' }}</dd>
                    <dt>Téléphone</dt>
                    <dd>{{ d.phone | phone }}</dd>
                    <dt>Propriétaire</dt>
                    <dd>
                      @if (auth.can('admin.drivers.read')) {
                        <a [routerLink]="['/conducteurs', d.owner.userId]">{{ d.owner.name ?? 'Nom non renseigné' }}</a>
                      } @else {
                        {{ d.owner.name ?? 'Nom non renseigné' }}
                      }
                    </dd>
                    <dt>Projet d’origine</dt>
                    <dd>
                      @if (d.project; as project) {
                        @if (auth.can('admin.projects.read')) {
                          <a [routerLink]="['/projets', project.id]">{{ project.title }}</a>
                        } @else {
                          {{ project.title }}
                        }
                      } @else {
                        —
                      }
                    </dd>
                    <dt>Créée le</dt>
                    <dd>{{ d.createdAt | frDate }}</dd>
                  </dl>
                  @if (d.description) {
                    <div class="divider"></div>
                    <p class="pre-line">{{ d.description }}</p>
                  }
                </div>
              </section>
            </div>
          </div>
        }
      </bi-async>

      <bi-action-dialog
        #suspendDialog
        title="Suspendre l'entreprise"
        message="Ses offres ouvertes sont fermées et elle ne peut plus en publier. Le propriétaire est notifié avec le motif."
        confirmLabel="Suspendre"
        tone="danger"
        reasonLabel="Motif communiqué au propriétaire"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="setStatus('SUSPENDED', $event, suspendDialog)"
      />
      <bi-action-dialog
        #activateDialog
        title="Réactiver l'entreprise"
        message="L'entreprise pourra de nouveau publier des offres. Les offres fermées ne sont pas rouvertes."
        confirmLabel="Réactiver"
        tone="success"
        reasonLabel="Motif (conservé dans le journal d'audit)"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="setStatus('ACTIVE', $event, activateDialog)"
      />
    </div>
  `,
})
export class CompanyDetailPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthStore);

  readonly id = input.required<string>();

  protected readonly data = new Loadable(() => this.api.get<CompanyDetail>(`/admin/companies/${this.id()}`));
  protected readonly action = new Action();
  protected readonly pageTitle = computed(() => this.data.value()?.name ?? 'Entreprise');
  protected readonly subtitle = computed(() => {
    const d = this.data.value();
    return d ? [d.sector, d.city].filter(Boolean).join(' · ') : '';
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.data.load());
    });
  }

  protected async setStatus(status: 'ACTIVE' | 'SUSPENDED', reason: string, dialog: ActionDialogComponent): Promise<void> {
    const result = await this.action.run(() => this.api.post<CompanyDetail>(`/admin/companies/${this.id()}/status`, { status, reason }));
    if (!result) return;
    this.data.set(result);
    dialog.close();
    this.toast.success(status === 'SUSPENDED' ? 'Entreprise suspendue : ses offres sont fermées.' : 'Entreprise réactivée.');
  }
}
