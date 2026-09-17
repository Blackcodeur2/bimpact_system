import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { PagedList } from '../../core/api/loaders';
import { downloadCsv, toCsv } from '../../core/csv';
import { dayEnd, dayKey, dayStart } from '../../core/format';
import { ACTOR_TYPE_LABELS, AUDIT_ACTION_LABELS, auditActionLabel } from '../../core/labels';
import { StaffDirectory } from '../../core/staff-directory.service';
import { UUID_RE } from '../../core/validation';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { AuditActionPipe, DictionaryLabelPipe, FrDateTimePipe } from '../../shared/pipes';

interface AuditRow {
  id: string;
  actorId: string | null;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  requestId: string | null;
  ipHash: string | null;
  createdAt: string;
}

@Component({
  selector: 'bi-audit-page',
  imports: [
    FormsModule,
    JsonPipe,
    AsyncStateComponent,
    IconComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    AuditActionPipe,
    DictionaryLabelPipe,
    FrDateTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header
        title="Journal d'audit"
        subtitle="Traces immuables des actions sensibles : connexions, décisions, mouvements financiers et consultations de données personnelles. Lecture seule."
      >
        <button type="button" class="btn btn-secondary" [disabled]="list.items().length === 0" (click)="exportCsv()">
          <bi-icon name="download" [size]="16" /> Exporter les lignes affichées
        </button>
      </bi-page-header>

      <section class="card">
        <form class="card-body filters" (submit)="$event.preventDefault(); apply()">
          <div class="field">
            <label for="audit-action">Action</label>
            <input id="audit-action" name="action" class="input" list="audit-actions" placeholder="ex. kyc.review.decided" [ngModel]="fAction()" (ngModelChange)="fAction.set($event)" />
            <datalist id="audit-actions">
              @for (option of actionOptions; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </datalist>
          </div>
          <div class="field">
            <label for="audit-resource-type">Type de ressource</label>
            <input id="audit-resource-type" name="resourceType" class="input" placeholder="ex. user, draw" [ngModel]="fResourceType()" (ngModelChange)="fResourceType.set($event)" />
          </div>
          <div class="field">
            <label for="audit-resource-id">Identifiant de ressource</label>
            <input id="audit-resource-id" name="resourceId" class="input" [ngModel]="fResourceId()" (ngModelChange)="fResourceId.set($event)" />
          </div>
          <div class="field">
            <label for="audit-actor">Agent</label>
            <input id="audit-actor" name="actorId" class="input" list="audit-actors" placeholder="Identifiant de l’acteur" [ngModel]="fActorId()" (ngModelChange)="fActorId.set($event)" />
            <datalist id="audit-actors">
              @for (entry of staff.entries(); track entry.id) {
                <option [value]="entry.id">{{ entry.name }}</option>
              }
            </datalist>
          </div>
          <div class="field">
            <label for="audit-from">Du</label>
            <input id="audit-from" name="from" type="date" class="input" [ngModel]="fFrom()" (ngModelChange)="fFrom.set($event)" />
          </div>
          <div class="field">
            <label for="audit-to">Au</label>
            <input id="audit-to" name="to" type="date" class="input" [ngModel]="fTo()" (ngModelChange)="fTo.set($event)" />
          </div>
          <button type="submit" class="btn btn-secondary"><bi-icon name="search" [size]="16" /> Filtrer</button>
          <button type="button" class="btn btn-ghost" (click)="clear()">Effacer</button>
        </form>
        @if (actorIdInvalid()) {
          <div class="card-footer field-error">L’identifiant de l’acteur doit être un UUID : il n’est pas appliqué.</div>
        }

        <bi-async
          [loading]="list.loading()"
          [error]="list.loaded() ? null : list.error()"
          [empty]="list.loaded() && list.items().length === 0"
          [hasContent]="list.items().length > 0"
          emptyTitle="Aucune entrée"
          emptyText="Aucune action ne correspond à ces critères."
          (retry)="list.reload()"
        >
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Acteur</th>
                  <th>Ressource</th>
                  <th><span class="sr-only">Détail</span></th>
                </tr>
              </thead>
              <tbody>
                @for (row of list.items(); track row.id) {
                  <tr class="clickable" [attr.aria-expanded]="expanded() === row.id" (click)="toggle(row.id)">
                    <td class="nowrap">{{ row.createdAt | frDateTime }}</td>
                    <td>
                      <div class="cell-title">{{ row.action | auditAction }}</div>
                      <div class="cell-sub mono">{{ row.action }}</div>
                    </td>
                    <td>
                      {{ actorName(row) }}
                      <div class="cell-sub">{{ row.actorType | label: actorLabels }}</div>
                    </td>
                    <td>
                      {{ row.resourceType }}
                      <div class="cell-sub mono break">{{ row.resourceId ?? '' }}</div>
                    </td>
                    <td><bi-icon name="chevron-right" [size]="16" /></td>
                  </tr>
                  @if (expanded() === row.id) {
                    <tr>
                      <td colspan="5" style="background: var(--neutral-50)">
                        <div class="grid grid-3">
                          <div>
                            <div class="eyebrow">Avant</div>
                            <pre class="json">{{ row.before | json }}</pre>
                          </div>
                          <div>
                            <div class="eyebrow">Après</div>
                            <pre class="json">{{ row.after | json }}</pre>
                          </div>
                          <div>
                            <div class="eyebrow">Contexte</div>
                            <pre class="json">{{ row.metadata | json }}</pre>
                          </div>
                        </div>
                        <dl class="dl small" style="margin-top: 10px">
                          <dt>Identifiant de l’acteur</dt>
                          <dd class="mono">{{ row.actorId ?? '—' }}</dd>
                          <dt>Requête</dt>
                          <dd class="mono">{{ row.requestId ?? '—' }}</dd>
                          <dt>Empreinte IP</dt>
                          <dd class="mono">{{ row.ipHash ?? '—' }}</dd>
                        </dl>
                      </td>
                    </tr>
                  }
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
export class AuditPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly staff = inject(StaffDirectory);

  /** Filtres transmis dans l'adresse (liens « Journal » des fiches). */
  readonly action = input<string>();
  readonly resourceType = input<string>();
  readonly resourceId = input<string>();
  readonly actorId = input<string>();

  protected readonly actorLabels = ACTOR_TYPE_LABELS;
  protected readonly actionOptions = Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({ value, label }));
  protected readonly fAction = signal('');
  protected readonly fResourceType = signal('');
  protected readonly fResourceId = signal('');
  protected readonly fActorId = signal('');
  protected readonly fFrom = signal('');
  protected readonly fTo = signal('');
  protected readonly expanded = signal<string | null>(null);

  protected readonly list = new PagedList<AuditRow>((cursor) =>
    this.api.get<Page<AuditRow>>('/admin/audit-logs', {
      action: this.fAction().trim(),
      resourceType: this.fResourceType().trim(),
      resourceId: this.fResourceId().trim(),
      actorId: UUID_RE.test(this.fActorId().trim()) ? this.fActorId().trim() : undefined,
      from: dayStart(this.fFrom()),
      to: dayEnd(this.fTo()),
      cursor,
      limit: 50,
    }),
  );

  ngOnInit(): void {
    this.staff.ensureLoaded();
    this.fAction.set(this.action() ?? '');
    this.fResourceType.set(this.resourceType() ?? '');
    this.fResourceId.set(this.resourceId() ?? '');
    this.fActorId.set(this.actorId() ?? '');
    void this.list.reload();
  }

  protected actorIdInvalid(): boolean {
    const value = this.fActorId().trim();
    return value !== '' && !UUID_RE.test(value);
  }

  protected apply(): void {
    this.expanded.set(null);
    void this.list.reload();
  }

  protected clear(): void {
    this.fAction.set('');
    this.fResourceType.set('');
    this.fResourceId.set('');
    this.fActorId.set('');
    this.fFrom.set('');
    this.fTo.set('');
    this.apply();
  }

  protected toggle(id: string): void {
    this.expanded.update((current) => (current === id ? null : id));
  }

  protected actorName(row: AuditRow): string {
    if (row.actorType === 'STAFF') return this.staff.name(row.actorId);
    if (row.actorType === 'SYSTEM') return 'Système';
    return row.actorId ? `Membre ${row.actorId.slice(0, 8)}` : '—';
  }

  protected exportCsv(): void {
    const csv = toCsv<AuditRow>(
      [
        { label: 'Date', value: (row) => row.createdAt },
        { label: 'Action', value: (row) => row.action },
        { label: 'Libellé', value: (row) => auditActionLabel(row.action) },
        { label: 'Type d’acteur', value: (row) => row.actorType },
        { label: 'Acteur', value: (row) => row.actorId },
        { label: 'Ressource', value: (row) => row.resourceType },
        { label: 'Identifiant de ressource', value: (row) => row.resourceId },
        { label: 'Requête', value: (row) => row.requestId },
        { label: 'Avant', value: (row) => (row.before ? JSON.stringify(row.before) : '') },
        { label: 'Après', value: (row) => (row.after ? JSON.stringify(row.after) : '') },
        { label: 'Contexte', value: (row) => (row.metadata ? JSON.stringify(row.metadata) : '') },
      ],
      this.list.items(),
    );
    downloadCsv(`journal-audit-${dayKey()}.csv`, csv);
  }
}
