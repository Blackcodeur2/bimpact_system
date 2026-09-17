import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Action, Loadable, PagedList } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { statusLabel } from '../../core/labels';
import { ToastService } from '../../core/toast.service';
import { ActionDialogComponent } from '../../shared/action-dialog.component';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { FrDatePipe, FrDateTimePipe, PhonePipe } from '../../shared/pipes';
import { BadgeComponent, StatusBadgeComponent } from '../../shared/status-badge.component';

interface JobRow {
  id: string;
  title: string;
  companyName: string;
  employer: { id: string; name: string; status: string } | null;
  sector: string | null;
  location: string;
  slots: number;
  isActive: boolean;
  createdAt: string;
  closedAt: string | null;
  applications: { total: number; byStatus: Record<string, number> };
}

interface JobApplications {
  job: {
    id: string;
    title: string;
    companyName: string;
    employer: { id: string; name: string } | null;
    description: string | null;
    requirements: unknown;
    skills: unknown;
    slots: number;
    isActive: boolean;
    createdAt: string;
    closedAt: string | null;
  };
  items: {
    id: string;
    status: string;
    message: string | null;
    createdAt: string;
    updatedAt: string;
    candidate: { userId: string; name: string | null; phone: string; city: string | null; identityVerified: boolean };
  }[];
}

@Component({
  selector: 'bi-recruitment-page',
  imports: [
    FormsModule,
    RouterLink,
    AsyncStateComponent,
    IconComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    BadgeComponent,
    FrDatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header title="Recrutement" subtitle="Offres d'emploi publiées dans l'application et candidatures reçues. Une offre abusive peut être fermée par l'équipe." />

      <section class="card">
        <form class="card-body filters" (submit)="$event.preventDefault(); list.reload()">
          <div class="field">
            <label for="jobs-q">Recherche</label>
            <input id="jobs-q" name="q" class="input" placeholder="Intitulé, entreprise ou lieu" [ngModel]="q()" (ngModelChange)="q.set($event)" />
          </div>
          <div class="field">
            <label for="jobs-active">État</label>
            <select id="jobs-active" name="active" class="input" [ngModel]="active()" (ngModelChange)="active.set($event); list.reload()">
              <option value="">Toutes les offres</option>
              <option value="true">Ouvertes</option>
              <option value="false">Fermées</option>
            </select>
          </div>
          <button type="submit" class="btn btn-secondary"><bi-icon name="search" [size]="16" /> Rechercher</button>
        </form>
        <bi-async
          [loading]="list.loading()"
          [error]="list.loaded() ? null : list.error()"
          [empty]="list.loaded() && list.items().length === 0"
          [hasContent]="list.items().length > 0"
          emptyTitle="Aucune offre"
          emptyText="Aucune offre d'emploi ne correspond à ces critères."
          (retry)="list.reload()"
        >
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Offre</th>
                  <th>Employeur</th>
                  <th>Lieu</th>
                  <th class="num">Postes</th>
                  <th>Candidatures</th>
                  <th>Publiée le</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                @for (row of list.items(); track row.id) {
                  <tr class="clickable" (click)="open(row.id)">
                    <td>
                      <a class="cell-title" [routerLink]="['/recrutement', row.id]" (click)="$event.stopPropagation()">{{ row.title }}</a>
                      <div class="cell-sub">{{ row.sector ?? '' }}</div>
                    </td>
                    <td>
                      {{ row.employer?.name ?? row.companyName }}
                      @if (!row.employer) {
                        <div class="cell-sub">Hors programme</div>
                      }
                    </td>
                    <td>{{ row.location }}</td>
                    <td class="num">{{ row.slots }}</td>
                    <td>
                      <strong>{{ row.applications.total }}</strong>
                      <div class="cell-sub">{{ breakdown(row.applications.byStatus) }}</div>
                    </td>
                    <td class="nowrap">{{ row.createdAt | frDate }}</td>
                    <td>
                      @if (row.isActive) {
                        <bi-badge tone="success">Ouverte</bi-badge>
                      } @else {
                        <bi-badge>Fermée</bi-badge>
                      }
                    </td>
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
export class RecruitmentPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly q = signal('');
  protected readonly active = signal('true');
  protected readonly list = new PagedList<JobRow>((cursor) =>
    this.api.get<Page<JobRow>>('/admin/recruitment/jobs', { q: this.q().trim(), active: this.active(), cursor, limit: 25 }),
  );

  ngOnInit(): void {
    void this.list.reload();
  }

  protected open(id: string): void {
    void this.router.navigate(['/recrutement', id]);
  }

  protected breakdown(byStatus: Record<string, number>): string {
    return Object.entries(byStatus)
      .map(([status, count]) => `${count} ${statusLabel('application', status).label.toLowerCase()}`)
      .join(' · ');
  }
}

@Component({
  selector: 'bi-job-applications-page',
  imports: [
    RouterLink,
    ActionDialogComponent,
    AsyncStateComponent,
    IconComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    BadgeComponent,
    FrDatePipe,
    FrDateTimePipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header [title]="pageTitle()" [subtitle]="subtitle()" backLink="/recrutement" backLabel="Recrutement">
        @if (data.value(); as d) {
          @if (d.job.isActive && auth.can('admin.recruitment.manage')) {
            <button type="button" class="btn btn-danger" (click)="action.reset(); closeDialog.open()"><bi-icon name="x" [size]="16" /> Fermer l’offre</button>
          }
        }
      </bi-page-header>

      <bi-async [loading]="data.loading()" [error]="data.error()" [hasContent]="!!data.value()" (retry)="data.load()">
        @if (data.value(); as d) {
          <div class="grid grid-main-side">
            <section class="card">
              <div class="card-header">
                <h3>Candidatures</h3>
                <span class="muted small">{{ d.items.length }} reçue(s)</span>
              </div>
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Candidat</th>
                      <th>Ville</th>
                      <th>Identité</th>
                      <th>Message</th>
                      <th>Reçue le</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (application of d.items; track application.id) {
                      <tr>
                        <td>
                          @if (auth.can('admin.drivers.read')) {
                            <a class="cell-title" [routerLink]="['/conducteurs', application.candidate.userId]">{{ application.candidate.name ?? 'Nom non renseigné' }}</a>
                          } @else {
                            <span class="cell-title">{{ application.candidate.name ?? 'Nom non renseigné' }}</span>
                          }
                          <div class="cell-sub">{{ application.candidate.phone | phone }}</div>
                        </td>
                        <td>{{ application.candidate.city ?? '—' }}</td>
                        <td>
                          @if (application.candidate.identityVerified) {
                            <bi-badge tone="success">Vérifiée</bi-badge>
                          } @else {
                            <bi-badge>Non vérifiée</bi-badge>
                          }
                        </td>
                        <td class="break">{{ application.message ?? '—' }}</td>
                        <td class="nowrap">{{ application.createdAt | frDateTime }}</td>
                        <td><bi-status domain="application" [code]="application.status" /></td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="6" class="muted">Aucune candidature pour le moment.</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>

            <section class="card">
              <div class="card-header">
                <h3>Offre</h3>
                @if (d.job.isActive) {
                  <bi-badge tone="success">Ouverte</bi-badge>
                } @else {
                  <bi-badge>Fermée le {{ d.job.closedAt | frDate }}</bi-badge>
                }
              </div>
              <div class="card-body stack-sm">
                <dl class="dl">
                  <dt>Employeur</dt>
                  <dd>
                    @if (d.job.employer; as employer) {
                      @if (auth.can('admin.companies.read')) {
                        <a [routerLink]="['/entreprises', employer.id]">{{ employer.name }}</a>
                      } @else {
                        {{ employer.name }}
                      }
                    } @else {
                      {{ d.job.companyName }}
                    }
                  </dd>
                  <dt>Postes</dt>
                  <dd>{{ d.job.slots }}</dd>
                  <dt>Publiée le</dt>
                  <dd>{{ d.job.createdAt | frDate }}</dd>
                </dl>
                @if (d.job.description) {
                  <div class="divider"></div>
                  <p class="pre-line">{{ d.job.description }}</p>
                }
                @if (asList(d.job.requirements).length > 0) {
                  <div class="eyebrow">Exigences</div>
                  <ul style="margin: 0; padding-left: 18px">
                    @for (item of asList(d.job.requirements); track $index) {
                      <li>{{ item }}</li>
                    }
                  </ul>
                }
                @if (asList(d.job.skills).length > 0) {
                  <div class="eyebrow">Compétences</div>
                  <div class="row" style="gap: 6px">
                    @for (item of asList(d.job.skills); track $index) {
                      <span class="badge badge-plain">{{ item }}</span>
                    }
                  </div>
                }
              </div>
            </section>
          </div>
        }
      </bi-async>

      <bi-action-dialog
        #closeDialog
        title="Fermer l'offre"
        message="L'offre ne reçoit plus de candidatures. L'employeur est notifié avec votre motif."
        confirmLabel="Fermer l'offre"
        tone="danger"
        reasonLabel="Motif communiqué à l'employeur"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="closeJob($event, closeDialog)"
      />
    </div>
  `,
})
export class JobApplicationsPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthStore);

  readonly id = input.required<string>();

  protected readonly data = new Loadable(() => this.api.get<JobApplications>(`/admin/recruitment/jobs/${this.id()}/applications`));
  protected readonly action = new Action();
  protected readonly pageTitle = computed(() => this.data.value()?.job.title ?? 'Offre d’emploi');
  protected readonly subtitle = computed(() => {
    const job = this.data.value()?.job;
    return job ? job.employer?.name ?? job.companyName : '';
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.data.load());
    });
  }

  protected asList(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
    if (typeof value === 'string' && value.trim()) return value.split('\n').map((line) => line.trim()).filter(Boolean);
    return [];
  }

  protected async closeJob(reason: string, dialog: ActionDialogComponent): Promise<void> {
    const result = await this.action.run(() => this.api.post<JobApplications>(`/admin/recruitment/jobs/${this.id()}/close`, { reason }));
    if (!result) return;
    this.data.set(result);
    dialog.close();
    this.toast.success('Offre fermée : l’employeur est notifié.');
  }
}
