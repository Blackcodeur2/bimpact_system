import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { PagedList } from '../../core/api/loaders';
import { RISK_FLAG_LABELS } from '../../core/labels';
import { StaffDirectory } from '../../core/staff-directory.service';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DictionaryLabelPipe, FrDateTimePipe, FullNamePipe, PhonePipe, RelativeTimePipe } from '../../shared/pipes';
import { BadgeComponent, StatusBadgeComponent } from '../../shared/status-badge.component';

interface KycQueueRow {
  id: string;
  userId: string;
  status: string;
  applicant: { firstName: string | null; lastName: string | null; phone: string };
  city: string | null;
  submittedAt: string | null;
  submissionCount: number;
  riskFlags: string[];
  reviewerId: string | null;
  reviewStartedAt: string | null;
  documentCount: number;
}

@Component({
  selector: 'bi-kyc-queue-page',
  imports: [
    FormsModule,
    RouterLink,
    AsyncStateComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    BadgeComponent,
    DictionaryLabelPipe,
    FrDateTimePipe,
    FullNamePipe,
    PhonePipe,
    RelativeTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header
        title="Vérification d'identité"
        subtitle="File d'attente des dossiers soumis, du plus ancien au plus récent. Prenez un dossier en charge pour éviter qu'il soit traité deux fois."
      />

      <section class="card">
        <div class="card-body filters">
          <div class="field">
            <label for="kyc-status">Dossiers</label>
            <select id="kyc-status" name="status" class="input" [ngModel]="status()" (ngModelChange)="status.set($event); list.reload()">
              <option value="">Tous les dossiers à traiter</option>
              <option value="SUBMITTED">À examiner</option>
              <option value="UNDER_REVIEW">En revue</option>
            </select>
          </div>
        </div>

        <bi-async
          [loading]="list.loading()"
          [error]="list.loaded() ? null : list.error()"
          [empty]="list.loaded() && list.items().length === 0"
          [hasContent]="list.items().length > 0"
          emptyTitle="File vide"
          emptyText="Aucun dossier d'identité n'attend de vérification."
          (retry)="list.reload()"
        >
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Demandeur</th>
                  <th>Ville</th>
                  <th>Statut</th>
                  <th>Soumis</th>
                  <th class="num">Soumission</th>
                  <th class="num">Pièces</th>
                  <th>Alertes</th>
                  <th>Réviseur</th>
                </tr>
              </thead>
              <tbody>
                @for (row of list.items(); track row.id) {
                  <tr class="clickable" (click)="open(row.id)">
                    <td>
                      <a class="cell-title" [routerLink]="['/kyc', row.id]" (click)="$event.stopPropagation()">{{ row.applicant | fullName }}</a>
                      <div class="cell-sub">{{ row.applicant.phone | phone }}</div>
                    </td>
                    <td>{{ row.city ?? '—' }}</td>
                    <td><bi-status domain="kyc" [code]="row.status" /></td>
                    <td class="nowrap">
                      {{ row.submittedAt | frDateTime }}
                      <div class="cell-sub">{{ row.submittedAt | ago }}</div>
                    </td>
                    <td class="num">n° {{ row.submissionCount }}</td>
                    <td class="num">{{ row.documentCount }}</td>
                    <td>
                      <div class="row" style="gap: 4px">
                        @for (flag of row.riskFlags; track flag) {
                          <bi-badge tone="warning">{{ flag | label: riskFlagLabels }}</bi-badge>
                        } @empty {
                          <span class="muted">—</span>
                        }
                      </div>
                    </td>
                    <td>
                      @if (row.reviewerId) {
                        {{ staff.name(row.reviewerId) }}
                        <div class="cell-sub">depuis {{ row.reviewStartedAt | ago }}</div>
                      } @else {
                        <span class="muted">Non attribué</span>
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
export class KycQueuePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly staff = inject(StaffDirectory);

  protected readonly riskFlagLabels = RISK_FLAG_LABELS;
  protected readonly status = signal('');
  protected readonly list = new PagedList<KycQueueRow>((cursor) =>
    this.api.get<Page<KycQueueRow>>('/admin/kyc/queue', { status: this.status(), cursor, limit: 25 }),
  );

  ngOnInit(): void {
    this.staff.ensureLoaded();
    void this.list.reload();
  }

  protected open(id: string): void {
    void this.router.navigate(['/kyc', id]);
  }
}
