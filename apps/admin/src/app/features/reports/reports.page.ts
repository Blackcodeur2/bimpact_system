import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { Loadable } from '../../core/api/loaders';
import { downloadCsv, toCsv } from '../../core/csv';
import { dayKey, formatAmount, formatDate, formatDateTime } from '../../core/format';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { PageHeaderComponent } from '../../shared/page-header.component';

type ColumnKind = 'date' | 'text' | 'integer' | 'amount';
type Cell = string | number | null;

interface ReportTable {
  key: string;
  title: string;
  columns: { key: string; label: string; kind: ColumnKind }[];
  rows: Record<string, Cell>[];
}

interface Report {
  type: string;
  title: string;
  from: string;
  to: string;
  generatedAt: string;
  tables: ReportTable[];
}

const MAX_DAYS = 366;

@Component({
  selector: 'bi-reports-page',
  imports: [FormsModule, AsyncStateComponent, IconComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header
        title="Rapports"
        subtitle="Agrégats calculés sur les données réelles de la période choisie, exportables en CSV. Chaque génération est tracée dans le journal d'audit."
      />

      <section class="card" style="margin-bottom: 16px">
        <form class="card-body filters" (submit)="$event.preventDefault(); generate()">
          <div class="field">
            <label for="report-type">Rapport</label>
            <select id="report-type" name="type" class="input" [ngModel]="type()" (ngModelChange)="type.set($event)">
              @for (item of types.value()?.items ?? []; track item.type) {
                <option [value]="item.type">{{ item.title }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="report-from">Du</label>
            <input id="report-from" name="from" type="date" class="input" [max]="to()" [ngModel]="from()" (ngModelChange)="from.set($event)" />
          </div>
          <div class="field">
            <label for="report-to">Au</label>
            <input id="report-to" name="to" type="date" class="input" [min]="from()" [max]="today" [ngModel]="to()" (ngModelChange)="to.set($event)" />
          </div>
          <div class="row" style="gap: 4px">
            @for (preset of presets; track preset) {
              <button type="button" class="btn btn-ghost btn-sm" (click)="usePreset(preset)">{{ preset }} j</button>
            }
          </div>
          <span class="spacer"></span>
          <button type="submit" class="btn" [disabled]="!!rangeError() || report.loading()">
            @if (report.loading()) {
              <span class="spinner"></span>
            } @else {
              <bi-icon name="report" [size]="16" />
            }
            Générer le rapport
          </button>
        </form>
        @if (rangeError(); as message) {
          <div class="card-footer field-error">{{ message }}</div>
        }
      </section>

      @if (!report.value() && !report.loading() && !report.error()) {
        <section class="card card-body muted">Choisissez un rapport et une période, puis cliquez sur « Générer le rapport ».</section>
      } @else {
        <bi-async [loading]="report.loading()" [error]="report.error()" [hasContent]="!!report.value()" (retry)="generate()">
          @if (report.value(); as r) {
            <div class="stack">
              <p class="muted small">{{ r.title }} — du {{ day(r.from) }} au {{ day(r.to) }} · généré le {{ dateTime(r.generatedAt) }}</p>
              @for (table of r.tables; track table.key) {
                <section class="card">
                  <div class="card-header">
                    <h3>{{ table.title }}</h3>
                    <button type="button" class="btn btn-secondary btn-sm" [disabled]="table.rows.length === 0" (click)="exportTable(r, table)">
                      <bi-icon name="download" [size]="14" /> CSV
                    </button>
                  </div>
                  <div class="table-wrap">
                    <table class="table">
                      <thead>
                        <tr>
                          @for (column of table.columns; track column.key) {
                            <th [class.num]="isNumeric(column.kind)">{{ column.label }}</th>
                          }
                        </tr>
                      </thead>
                      <tbody>
                        @for (row of table.rows; track $index) {
                          <tr>
                            @for (column of table.columns; track column.key) {
                              <td [class.num]="isNumeric(column.kind)" class="nowrap">{{ cell(column.kind, row[column.key]) }}</td>
                            }
                          </tr>
                        } @empty {
                          <tr>
                            <td [attr.colspan]="table.columns.length" class="muted">Aucune donnée sur la période.</td>
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
    </div>
  `,
})
export class ReportsPage implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly today = dayKey();
  protected readonly presets = [7, 30, 90, 365];
  protected readonly type = signal('members');
  protected readonly from = signal(dayKey(-29));
  protected readonly to = signal(dayKey());

  protected readonly rangeError = computed(() => {
    const from = this.from();
    const to = this.to();
    if (!from || !to) return 'Indiquez la date de début et la date de fin.';
    if (from > to) return 'La date de début doit précéder la date de fin.';
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
    return days > MAX_DAYS ? `La période est limitée à ${MAX_DAYS} jours.` : null;
  });

  protected readonly types = new Loadable(() => this.api.get<{ items: { type: string; title: string }[] }>('/admin/reports'));
  protected readonly report = new Loadable(() =>
    this.api.get<Report>(`/admin/reports/${encodeURIComponent(this.type())}`, { from: this.from(), to: this.to() }),
  );

  ngOnInit(): void {
    void this.types.load();
  }

  protected generate(): void {
    if (!this.rangeError()) void this.report.load();
  }

  protected usePreset(days: number): void {
    this.from.set(dayKey(-(days - 1)));
    this.to.set(dayKey());
  }

  protected isNumeric(kind: ColumnKind): boolean {
    return kind === 'integer' || kind === 'amount';
  }

  protected cell(kind: ColumnKind, value: Cell | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    if (kind === 'date') return this.day(String(value));
    if (kind === 'integer' || kind === 'amount') return formatAmount(String(value));
    return String(value);
  }

  protected day(value: string): string {
    return formatDate(`${value}T12:00:00Z`);
  }

  protected dateTime(value: string): string {
    return formatDateTime(value);
  }

  protected exportTable(report: Report, table: ReportTable): void {
    const columns = table.columns.map((column) => ({ label: column.label, value: (row: Record<string, Cell>) => row[column.key] }));
    downloadCsv(`rapport-${report.type}-${table.key}-${report.from}-${report.to}.csv`, toCsv(columns, table.rows));
  }
}
