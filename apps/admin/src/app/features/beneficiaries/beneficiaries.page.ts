import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Action, PagedList } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { fullName } from '../../core/format';
import { statusLabel, statusOptions } from '../../core/labels';
import { ToastService } from '../../core/toast.service';
import { ActionDialogComponent } from '../../shared/action-dialog.component';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { FrDatePipe, FullNamePipe, PhonePipe } from '../../shared/pipes';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

interface BeneficiaryRow {
  id: string;
  status: string;
  selectedAt: string;
  mentorName: string | null;
  statusNote: string | null;
  draw: { code: string; title: string };
  member: { userId: string; phone: string; firstName: string | null; lastName: string | null; city: string | null };
  allowedTransitions: string[];
}

@Component({
  selector: 'bi-beneficiaries-page',
  imports: [
    FormsModule,
    RouterLink,
    ActionDialogComponent,
    AsyncStateComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    FrDatePipe,
    FullNamePipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header
        title="Bénéficiaires"
        subtitle="Gagnants des tirages publiés et leur parcours : sélection, formation, certification puis création d'entreprise. Chaque étape franchie notifie le membre."
      />

      <section class="card">
        <div class="card-body filters">
          <div class="field">
            <label for="beneficiaries-status">Étape</label>
            <select id="beneficiaries-status" name="status" class="input" [ngModel]="status()" (ngModelChange)="status.set($event); list.reload()">
              <option value="">Toutes les étapes</option>
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
          emptyTitle="Aucun bénéficiaire"
          emptyText="Les bénéficiaires apparaissent à la publication d'un tirage."
          (retry)="list.reload()"
        >
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Bénéficiaire</th>
                  <th>Ville</th>
                  <th>Tirage</th>
                  <th>Sélectionné le</th>
                  <th>Mentor</th>
                  <th>Étape</th>
                  @if (canManage()) {
                    <th><span class="sr-only">Actions</span></th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of list.items(); track row.id) {
                  <tr>
                    <td>
                      @if (auth.can('admin.drivers.read')) {
                        <a class="cell-title" [routerLink]="['/conducteurs', row.member.userId]">{{ row.member | fullName }}</a>
                      } @else {
                        <span class="cell-title">{{ row.member | fullName }}</span>
                      }
                      <div class="cell-sub">{{ row.member.phone | phone }}</div>
                    </td>
                    <td>{{ row.member.city ?? '—' }}</td>
                    <td>
                      {{ row.draw.title }}
                      <div class="cell-sub mono">{{ row.draw.code }}</div>
                    </td>
                    <td class="nowrap">{{ row.selectedAt | frDate }}</td>
                    <td>{{ row.mentorName ?? '—' }}</td>
                    <td>
                      <bi-status domain="beneficiary" [code]="row.status" />
                      @if (row.statusNote) {
                        <div class="cell-sub">{{ row.statusNote }}</div>
                      }
                    </td>
                    @if (canManage()) {
                      <td>
                        <button type="button" class="btn btn-secondary btn-sm" (click)="edit(row, editDialog)">Modifier</button>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <bi-load-more [list]="list" />
        </bi-async>
      </section>

      <bi-action-dialog
        #editDialog
        [title]="dialogTitle()"
        message="Les étapes suivent l'ordre du parcours. Un bénéficiaire retiré ou entrepreneur ne change plus d'étape."
        confirmLabel="Enregistrer"
        [valid]="editValid()"
        [busy]="save.busy()"
        [error]="save.error()"
        (confirmed)="saveEdit(editDialog)"
      >
        @if (editing(); as row) {
          <div class="field">
            <label for="beneficiary-status">Étape</label>
            <select id="beneficiary-status" name="beneficiaryStatus" class="input" [ngModel]="editStatus()" (ngModelChange)="editStatus.set($event)">
              <option [value]="row.status">{{ label(row.status) }} (actuelle)</option>
              @for (next of row.allowedTransitions; track next) {
                <option [value]="next">{{ label(next) }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="beneficiary-mentor">Mentor</label>
            <input id="beneficiary-mentor" name="beneficiaryMentor" class="input" maxlength="80" [ngModel]="editMentor()" (ngModelChange)="editMentor.set($event)" />
          </div>
          <div class="field">
            <label for="beneficiary-note">Note de suivi</label>
            <textarea id="beneficiary-note" name="beneficiaryNote" class="input" rows="3" maxlength="300" [ngModel]="editNote()" (ngModelChange)="editNote.set($event)"></textarea>
          </div>
        }
      </bi-action-dialog>
    </div>
  `,
})
export class BeneficiariesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthStore);

  protected readonly statusChoices = statusOptions('beneficiary');
  protected readonly status = signal('');
  protected readonly list = new PagedList<BeneficiaryRow>((cursor) =>
    this.api.get<Page<BeneficiaryRow>>('/admin/beneficiaries', { status: this.status(), cursor, limit: 25 }),
  );
  protected readonly canManage = computed(() => this.auth.can('admin.beneficiaries.manage'));

  protected readonly save = new Action();
  protected readonly editing = signal<BeneficiaryRow | null>(null);
  protected readonly editStatus = signal('');
  protected readonly editMentor = signal('');
  protected readonly editNote = signal('');

  protected readonly dialogTitle = computed(() => {
    const row = this.editing();
    return row ? `Parcours de ${fullName(row.member)}` : 'Parcours';
  });

  protected readonly editValid = computed(() => {
    const row = this.editing();
    if (!row) return false;
    const mentor = this.editMentor().trim();
    const note = this.editNote().trim();
    if (mentor && (mentor.length < 2 || mentor.length > 80)) return false;
    if (note.length > 300) return false;
    return this.editStatus() !== row.status || mentor !== (row.mentorName ?? '') || (note !== '' && note !== (row.statusNote ?? ''));
  });

  ngOnInit(): void {
    void this.list.reload();
  }

  protected label(code: string): string {
    return statusLabel('beneficiary', code).label;
  }

  protected edit(row: BeneficiaryRow, dialog: ActionDialogComponent): void {
    this.save.reset();
    this.editing.set(row);
    this.editStatus.set(row.status);
    this.editMentor.set(row.mentorName ?? '');
    this.editNote.set('');
    dialog.open();
  }

  protected async saveEdit(dialog: ActionDialogComponent): Promise<void> {
    const row = this.editing();
    if (!row || !this.editValid()) return;
    const mentor = this.editMentor().trim();
    const note = this.editNote().trim();
    const body = {
      ...(this.editStatus() !== row.status ? { status: this.editStatus() } : {}),
      ...(mentor && mentor !== row.mentorName ? { mentorName: mentor } : {}),
      ...(note ? { note } : {}),
    };
    const updated = await this.save.run(() =>
      this.api.patch<{ status: string; mentorName: string | null; statusNote: string | null; allowedTransitions: string[] }>(
        `/admin/beneficiaries/${row.id}`,
        body,
      ),
    );
    if (!updated) return;
    this.list.replace((item) => item.id === row.id, {
      ...row,
      status: updated.status,
      mentorName: updated.mentorName,
      statusNote: updated.statusNote,
      allowedTransitions: updated.allowedTransitions,
    });
    dialog.close();
    this.toast.success(updated.status !== row.status ? 'Étape mise à jour : le bénéficiaire est notifié.' : 'Parcours mis à jour.');
  }
}
