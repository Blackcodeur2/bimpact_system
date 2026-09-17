import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Action, Loadable, PagedList } from '../../core/api/loaders';
import { dictionaryOptions, LESSON_CONTENT_TYPES, statusLabel } from '../../core/labels';
import { ToastService } from '../../core/toast.service';
import { isIntegerBetween, lengthBetween } from '../../core/validation';
import { ActionDialogComponent } from '../../shared/action-dialog.component';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DictionaryLabelPipe, FrDatePipe, FrDateTimePipe, PhonePipe } from '../../shared/pipes';
import { BadgeComponent, StatusBadgeComponent } from '../../shared/status-badge.component';

interface ModuleRow {
  id: string;
  month: number;
  order: number;
  title: string;
  description: string;
  durationMinutes: number;
  iconName: string | null;
  status: string;
  updatedAt: string;
  lessons: number;
  quiz: { id: string; title: string; passScore: number; questions: number } | null;
  stats: { learners: number; submissions: number; averageScore: number | null; passedLearners: number };
}

interface CertificateRow {
  id: string;
  certificateNumber: string;
  holderName: string;
  title: string;
  issuedAt: string;
  verificationCode: string;
  revokedAt: string | null;
  revocationReason: string | null;
  member: { userId: string; phone: string };
}

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  contentType: string;
  audioUrl: string | null;
  markdownContent: string;
  keyPoints: string[];
  order: number;
  completions: number;
}

interface ModuleDetail {
  id: string;
  month: number;
  order: number;
  title: string;
  description: string;
  durationMinutes: number;
  iconName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  lessons: Lesson[];
  quiz: {
    id: string;
    title: string;
    passScore: number;
    submissions: number;
    structureLocked: boolean;
    questions: { id: string; question: string; options: string[]; correctIndex: number; explanation: string | null; order: number }[];
  } | null;
}

interface DraftQuestion {
  id?: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface QuizDraft {
  title: string;
  passScore: number | null;
  questions: DraftQuestion[];
}

/** Champs d'un module, partagés par la création et la modification. */
class ModuleForm {
  readonly month = signal<number | null>(1);
  readonly order = signal<number | null>(1);
  readonly title = signal('');
  readonly description = signal('');
  readonly durationMinutes = signal<number | null>(60);
  readonly iconName = signal('');

  readonly issue = computed(() => {
    if (!isIntegerBetween(this.month(), 1, 24)) return 'Le mois du parcours doit être compris entre 1 et 24.';
    if (!isIntegerBetween(this.order(), 1, 100)) return 'L’ordre d’affichage doit être compris entre 1 et 100.';
    if (!lengthBetween(this.title(), 3, 120)) return 'Le titre doit contenir entre 3 et 120 caractères.';
    if (!lengthBetween(this.description(), 10, 2000)) return 'La description doit contenir entre 10 et 2000 caractères.';
    if (!isIntegerBetween(this.durationMinutes(), 5, 2000)) return 'La durée doit être comprise entre 5 et 2000 minutes.';
    const icon = this.iconName().trim();
    if (icon && !/^[a-z0-9_]{2,40}$/.test(icon)) return 'Icône : lettres minuscules, chiffres et « _ » uniquement.';
    return null;
  });

  fill(values: { month: number; order: number; title: string; description: string; durationMinutes: number; iconName: string | null }): void {
    this.month.set(values.month);
    this.order.set(values.order);
    this.title.set(values.title);
    this.description.set(values.description);
    this.durationMinutes.set(values.durationMinutes);
    this.iconName.set(values.iconName ?? '');
  }

  body() {
    const icon = this.iconName().trim();
    return {
      month: this.month(),
      order: this.order(),
      title: this.title().trim(),
      description: this.description().trim(),
      durationMinutes: this.durationMinutes(),
      ...(icon ? { iconName: icon } : {}),
    };
  }
}

const MODULE_FIELDS = `
  <div class="grid grid-2">
    <div class="field">
      <label for="module-month">Mois du parcours</label>
      <input id="module-month" name="moduleMonth" type="number" min="1" max="24" class="input" [ngModel]="form.month()" (ngModelChange)="form.month.set($event)" />
    </div>
    <div class="field">
      <label for="module-order">Ordre d’affichage</label>
      <input id="module-order" name="moduleOrder" type="number" min="1" max="100" class="input" [ngModel]="form.order()" (ngModelChange)="form.order.set($event)" />
    </div>
  </div>
  <div class="field">
    <label for="module-title">Titre</label>
    <input id="module-title" name="moduleTitle" class="input" maxlength="120" [ngModel]="form.title()" (ngModelChange)="form.title.set($event)" />
  </div>
  <div class="field">
    <label for="module-description">Description</label>
    <textarea id="module-description" name="moduleDescription" class="input" rows="3" maxlength="2000" [ngModel]="form.description()" (ngModelChange)="form.description.set($event)"></textarea>
  </div>
  <div class="grid grid-2">
    <div class="field">
      <label for="module-duration">Durée estimée (minutes)</label>
      <input id="module-duration" name="moduleDuration" type="number" min="5" max="2000" class="input" [ngModel]="form.durationMinutes()" (ngModelChange)="form.durationMinutes.set($event)" />
    </div>
    <div class="field">
      <label for="module-icon">Icône (facultatif)</label>
      <input id="module-icon" name="moduleIcon" class="input" placeholder="ex. finance_basics" [ngModel]="form.iconName()" (ngModelChange)="form.iconName.set($event)" />
    </div>
  </div>
  @if (form.issue(); as issue) {
    <p class="hint">{{ issue }}</p>
  }
`;

@Component({
  selector: 'bi-training-page',
  imports: [
    FormsModule,
    RouterLink,
    ActionDialogComponent,
    AsyncStateComponent,
    IconComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    BadgeComponent,
    FrDatePipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header
        title="Formation"
        subtitle="Parcours entrepreneurial : modules mensuels, leçons, quiz et certificats. Un module n'est visible des membres qu'une fois publié."
      >
        @if (tab() === 'modules') {
          <button type="button" class="btn" (click)="openCreate(moduleDialog)"><bi-icon name="plus" [size]="16" /> Nouveau module</button>
        }
      </bi-page-header>

      <div class="tabs" role="tablist" style="margin-bottom: 16px">
        <button type="button" role="tab" class="tab" [class.active]="tab() === 'modules'" [attr.aria-selected]="tab() === 'modules'" (click)="selectTab('modules')">
          Modules
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          [class.active]="tab() === 'certificates'"
          [attr.aria-selected]="tab() === 'certificates'"
          (click)="selectTab('certificates')"
        >
          Certificats
        </button>
      </div>

      @if (tab() === 'modules') {
        <bi-async
          [loading]="modules.loading()"
          [error]="modules.error()"
          [hasContent]="!!modules.value()"
          [empty]="!!modules.value() && moduleItems().length === 0"
          emptyTitle="Aucun module"
          emptyText="Créez le premier module du parcours."
          (retry)="modules.load()"
        >
          <div class="stack">
            <div class="grid grid-3">
              <div class="card kpi">
                <span class="kpi-label">Modules publiés</span>
                <span class="kpi-value">{{ publishedCount() }} / {{ moduleItems().length }}</span>
                <span class="kpi-sub">{{ lessonsCount() }} leçon(s) au total</span>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Certificats valides</span>
                <span class="kpi-value">{{ modules.value()?.certificates ?? 0 }}</span>
                <span class="kpi-sub">Révoqués exclus</span>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Quiz configurés</span>
                <span class="kpi-value">{{ quizCount() }}</span>
                <span class="kpi-sub">sur {{ moduleItems().length }} module(s)</span>
              </div>
            </div>
            <section class="card">
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th class="num">Mois</th>
                      <th>Module</th>
                      <th>Statut</th>
                      <th class="num">Leçons</th>
                      <th>Quiz</th>
                      <th class="num">Apprenants</th>
                      <th class="num">Réussites</th>
                      <th class="num">Score moyen</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of moduleItems(); track row.id) {
                      <tr class="clickable" (click)="open(row.id)">
                        <td class="num strong">{{ row.month }}</td>
                        <td>
                          <a class="cell-title" [routerLink]="['/formation/modules', row.id]" (click)="$event.stopPropagation()">{{ row.title }}</a>
                          <div class="cell-sub">{{ row.durationMinutes }} min · ordre {{ row.order }}</div>
                        </td>
                        <td><bi-status domain="course" [code]="row.status" /></td>
                        <td class="num">{{ row.lessons }}</td>
                        <td>
                          @if (row.quiz; as quiz) {
                            {{ quiz.questions }} question(s) · {{ quiz.passScore }} %
                          } @else {
                            <bi-badge tone="warning">Aucun quiz</bi-badge>
                          }
                        </td>
                        <td class="num">{{ row.stats.learners }}</td>
                        <td class="num">{{ row.stats.passedLearners }}</td>
                        <td class="num">{{ row.stats.averageScore === null ? '—' : row.stats.averageScore + ' %' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </bi-async>
      } @else {
        <section class="card">
          <form class="card-body filters" (submit)="$event.preventDefault(); certificates.reload()">
            <div class="field">
              <label for="certificates-q">Recherche</label>
              <input id="certificates-q" name="q" class="input" placeholder="Titulaire ou numéro" [ngModel]="q()" (ngModelChange)="q.set($event)" />
            </div>
            <button type="submit" class="btn btn-secondary"><bi-icon name="search" [size]="16" /> Rechercher</button>
          </form>
          <bi-async
            [loading]="certificates.loading()"
            [error]="certificates.loaded() ? null : certificates.error()"
            [empty]="certificates.loaded() && certificates.items().length === 0"
            [hasContent]="certificates.items().length > 0"
            emptyTitle="Aucun certificat"
            emptyText="Les certificats sont délivrés automatiquement à la réussite du parcours."
            (retry)="certificates.reload()"
          >
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Numéro</th>
                    <th>Titulaire</th>
                    <th>Intitulé</th>
                    <th>Délivré le</th>
                    <th>Statut</th>
                    <th><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of certificates.items(); track row.id) {
                    <tr>
                      <td class="mono">
                        {{ row.certificateNumber }}
                        <div class="cell-sub">Code {{ row.verificationCode }}</div>
                      </td>
                      <td>
                        <a [routerLink]="['/conducteurs', row.member.userId]">{{ row.holderName }}</a>
                        <div class="cell-sub">{{ row.member.phone | phone }}</div>
                      </td>
                      <td>{{ row.title }}</td>
                      <td class="nowrap">{{ row.issuedAt | frDate }}</td>
                      <td>
                        @if (row.revokedAt) {
                          <bi-badge tone="danger">Révoqué le {{ row.revokedAt | frDate }}</bi-badge>
                          <div class="cell-sub">{{ row.revocationReason }}</div>
                        } @else {
                          <bi-badge tone="success">Valide</bi-badge>
                        }
                      </td>
                      <td>
                        @if (!row.revokedAt) {
                          <button type="button" class="btn btn-ghost btn-sm" (click)="startRevoke(row, revokeDialog)">Révoquer</button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <bi-load-more [list]="certificates" />
          </bi-async>
        </section>
      }

      <bi-action-dialog
        #moduleDialog
        title="Nouveau module"
        message="Le module est créé en brouillon : ajoutez ses leçons et son quiz avant de le publier."
        confirmLabel="Créer le module"
        [valid]="!form.issue()"
        [busy]="create.busy()"
        [error]="create.error()"
        (confirmed)="createModule(moduleDialog)"
      >
        ${MODULE_FIELDS}
      </bi-action-dialog>

      <bi-action-dialog
        #revokeDialog
        title="Révoquer le certificat"
        [message]="revokeMessage()"
        confirmLabel="Révoquer"
        tone="danger"
        reasonLabel="Motif communiqué au titulaire"
        [busy]="revoke.busy()"
        [error]="revoke.error()"
        (confirmed)="confirmRevoke($event, revokeDialog)"
      />
    </div>
  `,
})
export class TrainingPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly tab = signal<'modules' | 'certificates'>('modules');
  protected readonly modules = new Loadable(() => this.api.get<{ certificates: number; items: ModuleRow[] }>('/admin/training/modules'));
  protected readonly q = signal('');
  protected readonly certificates = new PagedList<CertificateRow>((cursor) =>
    this.api.get<Page<CertificateRow>>('/admin/training/certificates', { q: this.q().trim(), cursor, limit: 25 }),
  );

  protected readonly form = new ModuleForm();
  protected readonly create = new Action();
  protected readonly revoke = new Action();
  protected readonly revoking = signal<CertificateRow | null>(null);

  protected readonly publishedCount = computed(() => this.moduleItems().filter((row) => row.status === 'PUBLISHED').length);
  protected readonly lessonsCount = computed(() => this.moduleItems().reduce((sum, row) => sum + row.lessons, 0));
  protected readonly quizCount = computed(() => this.moduleItems().filter((row) => row.quiz).length);
  protected readonly revokeMessage = computed(() => {
    const row = this.revoking();
    return row ? `Le certificat ${row.certificateNumber} de ${row.holderName} ne sera plus reconnu lors des vérifications. Le titulaire est notifié.` : '';
  });

  ngOnInit(): void {
    void this.modules.load();
  }

  protected moduleItems(): ModuleRow[] {
    return this.modules.value()?.items ?? [];
  }

  protected selectTab(tab: 'modules' | 'certificates'): void {
    this.tab.set(tab);
    if (tab === 'certificates' && !this.certificates.loaded()) void this.certificates.reload();
  }

  protected open(id: string): void {
    void this.router.navigate(['/formation/modules', id]);
  }

  protected openCreate(dialog: ActionDialogComponent): void {
    const items = this.moduleItems();
    const nextMonth = Math.min(24, items.reduce((max, row) => Math.max(max, row.month), 0) + 1);
    const nextOrder = Math.min(100, items.reduce((max, row) => Math.max(max, row.order), 0) + 1);
    this.form.fill({ month: nextMonth, order: nextOrder, title: '', description: '', durationMinutes: 60, iconName: null });
    this.create.reset();
    dialog.open();
  }

  protected async createModule(dialog: ActionDialogComponent): Promise<void> {
    if (this.form.issue()) return;
    const module = await this.create.run(() => this.api.post<ModuleDetail>('/admin/training/modules', this.form.body()));
    if (!module) return;
    dialog.close();
    this.toast.success('Module créé en brouillon.');
    void this.router.navigate(['/formation/modules', module.id]);
  }

  protected startRevoke(row: CertificateRow, dialog: ActionDialogComponent): void {
    this.revoke.reset();
    this.revoking.set(row);
    dialog.open();
  }

  protected async confirmRevoke(reason: string, dialog: ActionDialogComponent): Promise<void> {
    const row = this.revoking();
    if (!row) return;
    const result = await this.revoke.run(() =>
      this.api.post<{ id: string; revokedAt: string; revocationReason: string }>(`/admin/training/certificates/${row.id}/revoke`, { reason }),
    );
    if (!result) return;
    this.certificates.replace((item) => item.id === row.id, { ...row, revokedAt: result.revokedAt, revocationReason: result.revocationReason });
    dialog.close();
    this.toast.success('Certificat révoqué : le titulaire est notifié.');
  }
}

class LessonForm {
  readonly editingId = signal<string | null>(null);
  readonly title = signal('');
  readonly description = signal('');
  readonly durationMinutes = signal<number | null>(10);
  readonly contentType = signal('TEXT');
  readonly audioUrl = signal('');
  readonly markdownContent = signal('');
  readonly keyPoints = signal('');
  readonly order = signal<number | null>(null);

  readonly points = computed(() =>
    this.keyPoints()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );

  readonly issue = computed(() => {
    if (!lengthBetween(this.title(), 3, 160)) return 'Le titre doit contenir entre 3 et 160 caractères.';
    if (this.description().trim().length > 1000) return 'La description est limitée à 1000 caractères.';
    if (!isIntegerBetween(this.durationMinutes(), 1, 600)) return 'La durée doit être comprise entre 1 et 600 minutes.';
    const url = this.audioUrl().trim();
    if (url && !/^https:\/\/\S+$/.test(url)) return 'Le média doit être une adresse HTTPS.';
    if (!lengthBetween(this.markdownContent(), 20, 50_000)) return 'Le contenu doit contenir au moins 20 caractères.';
    const points = this.points();
    if (points.length > 10) return '10 points clés maximum.';
    if (points.some((point) => point.length > 200)) return 'Chaque point clé est limité à 200 caractères.';
    const order = this.order();
    if (order !== null && !isIntegerBetween(order, 1, 100)) return 'L’ordre doit être compris entre 1 et 100.';
    return null;
  });

  fill(lesson: Lesson | null): void {
    this.editingId.set(lesson?.id ?? null);
    this.title.set(lesson?.title ?? '');
    this.description.set(lesson?.description ?? '');
    this.durationMinutes.set(lesson?.durationMinutes ?? 10);
    this.contentType.set(lesson?.contentType ?? 'TEXT');
    this.audioUrl.set(lesson?.audioUrl ?? '');
    this.markdownContent.set(lesson?.markdownContent ?? '');
    this.keyPoints.set((lesson?.keyPoints ?? []).join('\n'));
    this.order.set(lesson?.order ?? null);
  }

  body() {
    const description = this.description().trim();
    const url = this.audioUrl().trim();
    const order = this.order();
    return {
      title: this.title().trim(),
      ...(description ? { description } : {}),
      durationMinutes: this.durationMinutes(),
      contentType: this.contentType(),
      ...(url ? { audioUrl: url } : {}),
      markdownContent: this.markdownContent().trim(),
      keyPoints: this.points(),
      ...(order !== null ? { order } : {}),
    };
  }
}

const STATUS_TARGETS: Record<string, { status: string; label: string }[]> = {
  DRAFT: [{ status: 'PUBLISHED', label: 'Publier' }],
  PUBLISHED: [
    { status: 'DRAFT', label: 'Repasser en brouillon' },
    { status: 'ARCHIVED', label: 'Archiver' },
  ],
  ARCHIVED: [
    { status: 'PUBLISHED', label: 'Republier' },
    { status: 'DRAFT', label: 'Repasser en brouillon' },
  ],
};

@Component({
  selector: 'bi-training-module-page',
  imports: [
    FormsModule,
    ActionDialogComponent,
    AsyncStateComponent,
    IconComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    DictionaryLabelPipe,
    FrDateTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .question {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .option {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .option input[type='radio'] {
      width: 18px;
      height: 18px;
      flex: none;
    }
  `,
  template: `
    <div class="page">
      <bi-page-header [title]="pageTitle()" [subtitle]="subtitle()" backLink="/formation" backLabel="Formation">
        @if (data.value(); as d) {
          <button type="button" class="btn btn-secondary" (click)="editModule(d, moduleDialog)"><bi-icon name="settings" [size]="16" /> Modifier</button>
          @for (target of statusTargets(d.status); track target.status) {
            <button
              type="button"
              class="btn"
              [class.btn-success]="target.status === 'PUBLISHED'"
              [class.btn-secondary]="target.status !== 'PUBLISHED'"
              (click)="askStatus(target.status, statusDialog)"
            >
              {{ target.label }}
            </button>
          }
        }
      </bi-page-header>

      <bi-async [loading]="data.loading()" [error]="data.error()" [hasContent]="!!data.value()" (retry)="reload()">
        @if (data.value(); as d) {
          <div class="grid grid-main-side">
            <div class="stack">
              <section class="card">
                <div class="card-header">
                  <h3>Leçons</h3>
                  <button type="button" class="btn btn-secondary btn-sm" (click)="newLesson(lessonDialog)"><bi-icon name="plus" [size]="14" /> Ajouter une leçon</button>
                </div>
                <div class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th class="num">Ordre</th>
                        <th>Leçon</th>
                        <th>Format</th>
                        <th class="num">Durée</th>
                        <th class="num">Terminée par</th>
                        <th><span class="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (lesson of d.lessons; track lesson.id) {
                        <tr>
                          <td class="num">{{ lesson.order }}</td>
                          <td>
                            <div class="cell-title">{{ lesson.title }}</div>
                            @if (lesson.description) {
                              <div class="cell-sub">{{ lesson.description }}</div>
                            }
                          </td>
                          <td>{{ lesson.contentType | label: contentTypes }}</td>
                          <td class="num nowrap">{{ lesson.durationMinutes }} min</td>
                          <td class="num">{{ lesson.completions }}</td>
                          <td class="nowrap">
                            <button type="button" class="btn btn-ghost btn-sm" (click)="editLesson(lesson, lessonDialog)">Modifier</button>
                            <button type="button" class="btn btn-ghost btn-sm" (click)="askDelete(lesson, deleteDialog)">Supprimer</button>
                          </td>
                        </tr>
                      } @empty {
                        <tr>
                          <td colspan="6" class="muted">Aucune leçon : ajoutez-en au moins une avant de publier le module.</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </section>

              <section class="card">
                <div class="card-header">
                  <h3>Quiz de validation</h3>
                  @if (d.quiz; as savedQuiz) {
                    <span class="muted small">{{ savedQuiz.submissions }} tentative(s)</span>
                  }
                </div>
                <div class="card-body stack">
                  @if (quizLocked()) {
                    <div class="alert alert-warning">
                      <bi-icon name="lock" [size]="18" />
                      <div>Des membres ont déjà passé ce quiz : seules les formulations et le seuil de réussite peuvent être corrigés.</div>
                    </div>
                  }
                  <div class="grid grid-2">
                    <div class="field">
                      <label for="quiz-title">Titre du quiz</label>
                      <input id="quiz-title" class="input" maxlength="160" [ngModel]="quiz().title" (ngModelChange)="patchQuiz({ title: $event })" />
                    </div>
                    <div class="field">
                      <label for="quiz-pass">Score de réussite (%)</label>
                      <input id="quiz-pass" type="number" min="50" max="100" class="input" [ngModel]="quiz().passScore" (ngModelChange)="patchQuiz({ passScore: $event })" />
                    </div>
                  </div>

                  @for (question of quiz().questions; track $index; let qi = $index) {
                    <div class="question">
                      <div class="row-nowrap">
                        <strong class="spacer">Question {{ qi + 1 }}</strong>
                        @if (!quizLocked()) {
                          <button type="button" class="btn btn-ghost btn-sm" (click)="removeQuestion(qi)">Retirer</button>
                        }
                      </div>
                      <textarea
                        class="input"
                        rows="2"
                        maxlength="500"
                        [attr.aria-label]="'Énoncé de la question ' + (qi + 1)"
                        [ngModel]="question.question"
                        (ngModelChange)="patchQuestion(qi, { question: $event })"
                      ></textarea>
                      <div class="stack-sm">
                        <span class="hint">Cochez la bonne réponse.</span>
                        @for (option of question.options; track $index; let oi = $index) {
                          <div class="option">
                            <input
                              type="radio"
                              [name]="'correct-' + qi"
                              [checked]="question.correctIndex === oi"
                              [disabled]="quizLocked()"
                              [attr.aria-label]="'Bonne réponse : option ' + (oi + 1)"
                              (change)="patchQuestion(qi, { correctIndex: oi })"
                            />
                            <input class="input" maxlength="200" [placeholder]="'Option ' + (oi + 1)" [ngModel]="option" (ngModelChange)="setOption(qi, oi, $event)" />
                            @if (!quizLocked() && question.options.length > 2) {
                              <button type="button" class="icon-btn" aria-label="Retirer l’option" (click)="removeOption(qi, oi)"><bi-icon name="x" [size]="14" /></button>
                            }
                          </div>
                        }
                        @if (!quizLocked() && question.options.length < 6) {
                          <div>
                            <button type="button" class="btn btn-ghost btn-sm" (click)="addOption(qi)"><bi-icon name="plus" [size]="14" /> Ajouter une option</button>
                          </div>
                        }
                      </div>
                      <input
                        class="input"
                        maxlength="1000"
                        placeholder="Explication affichée après la réponse (facultatif)"
                        [ngModel]="question.explanation"
                        (ngModelChange)="patchQuestion(qi, { explanation: $event })"
                      />
                    </div>
                  } @empty {
                    <p class="muted">Aucune question pour le moment.</p>
                  }

                  @if (!quizLocked()) {
                    <div>
                      <button type="button" class="btn btn-secondary btn-sm" [disabled]="quiz().questions.length >= 30" (click)="addQuestion()">
                        <bi-icon name="plus" [size]="14" /> Ajouter une question
                      </button>
                    </div>
                  }
                  @if (quizIssue(); as issue) {
                    <p class="hint">{{ issue }}</p>
                  }
                  @if (saveQuizAction.error(); as err) {
                    <div class="alert alert-danger" role="alert">{{ err }}</div>
                  }
                  <div class="row">
                    <span class="spacer"></span>
                    <button type="button" class="btn btn-secondary" [disabled]="saveQuizAction.busy()" (click)="resetQuiz()">Annuler les modifications</button>
                    <button type="button" class="btn" [disabled]="saveQuizAction.busy() || !!quizIssue()" (click)="saveQuiz()">
                      @if (saveQuizAction.busy()) {
                        <span class="spinner"></span>
                      }
                      Enregistrer le quiz
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div class="stack">
              <section class="card">
                <div class="card-header">
                  <h3>Module</h3>
                  <bi-status domain="course" [code]="d.status" />
                </div>
                <div class="card-body stack-sm">
                  <dl class="dl">
                    <dt>Mois du parcours</dt>
                    <dd>{{ d.month }}</dd>
                    <dt>Ordre</dt>
                    <dd>{{ d.order }}</dd>
                    <dt>Durée</dt>
                    <dd>{{ d.durationMinutes }} min</dd>
                    <dt>Icône</dt>
                    <dd class="mono">{{ d.iconName ?? '—' }}</dd>
                    <dt>Créé le</dt>
                    <dd>{{ d.createdAt | frDateTime }}</dd>
                    <dt>Modifié le</dt>
                    <dd>{{ d.updatedAt | frDateTime }}</dd>
                  </dl>
                  <div class="divider"></div>
                  <p class="pre-line">{{ d.description }}</p>
                </div>
              </section>
            </div>
          </div>
        }
      </bi-async>

      <bi-action-dialog
        #moduleDialog
        title="Modifier le module"
        confirmLabel="Enregistrer"
        [valid]="!form.issue()"
        [busy]="moduleAction.busy()"
        [error]="moduleAction.error()"
        (confirmed)="saveModule(moduleDialog)"
      >
        ${MODULE_FIELDS}
      </bi-action-dialog>

      <bi-action-dialog
        #statusDialog
        [title]="statusTitle()"
        [message]="statusMessage()"
        confirmLabel="Confirmer"
        [tone]="pendingStatus() === 'PUBLISHED' ? 'success' : 'primary'"
        [busy]="moduleAction.busy()"
        [error]="moduleAction.error()"
        (confirmed)="changeStatus(statusDialog)"
      />

      <bi-action-dialog
        #lessonDialog
        [title]="lessonForm.editingId() ? 'Modifier la leçon' : 'Nouvelle leçon'"
        confirmLabel="Enregistrer la leçon"
        [wide]="true"
        [valid]="!lessonForm.issue()"
        [busy]="lessonAction.busy()"
        [error]="lessonAction.error()"
        (confirmed)="saveLesson(lessonDialog)"
      >
        <div class="field">
          <label for="lesson-title">Titre</label>
          <input id="lesson-title" name="lessonTitle" class="input" maxlength="160" [ngModel]="lessonForm.title()" (ngModelChange)="lessonForm.title.set($event)" />
        </div>
        <div class="field">
          <label for="lesson-description">Résumé (facultatif)</label>
          <input id="lesson-description" name="lessonDescription" class="input" maxlength="1000" [ngModel]="lessonForm.description()" (ngModelChange)="lessonForm.description.set($event)" />
        </div>
        <div class="grid grid-3">
          <div class="field">
            <label for="lesson-type">Format</label>
            <select id="lesson-type" name="lessonType" class="input" [ngModel]="lessonForm.contentType()" (ngModelChange)="lessonForm.contentType.set($event)">
              @for (option of contentTypeChoices; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="lesson-duration">Durée (minutes)</label>
            <input id="lesson-duration" name="lessonDuration" type="number" min="1" max="600" class="input" [ngModel]="lessonForm.durationMinutes()" (ngModelChange)="lessonForm.durationMinutes.set($event)" />
          </div>
          <div class="field">
            <label for="lesson-order">Ordre (facultatif)</label>
            <input id="lesson-order" name="lessonOrder" type="number" min="1" max="100" class="input" [ngModel]="lessonForm.order()" (ngModelChange)="lessonForm.order.set($event)" />
          </div>
        </div>
        @if (lessonForm.contentType() !== 'TEXT') {
          <div class="field">
            <label for="lesson-media">Adresse du média (HTTPS)</label>
            <input id="lesson-media" name="lessonMedia" class="input" placeholder="https://…" [ngModel]="lessonForm.audioUrl()" (ngModelChange)="lessonForm.audioUrl.set($event)" />
          </div>
        }
        <div class="field">
          <label for="lesson-content">Contenu (Markdown)</label>
          <textarea id="lesson-content" name="lessonContent" class="input" rows="10" [ngModel]="lessonForm.markdownContent()" (ngModelChange)="lessonForm.markdownContent.set($event)"></textarea>
        </div>
        <div class="field">
          <label for="lesson-points">Points clés (un par ligne, 10 maximum)</label>
          <textarea id="lesson-points" name="lessonPoints" class="input" rows="4" [ngModel]="lessonForm.keyPoints()" (ngModelChange)="lessonForm.keyPoints.set($event)"></textarea>
        </div>
        @if (lessonForm.issue(); as issue) {
          <p class="hint">{{ issue }}</p>
        }
      </bi-action-dialog>

      <bi-action-dialog
        #deleteDialog
        title="Supprimer la leçon"
        [message]="deleteMessage()"
        confirmLabel="Supprimer"
        tone="danger"
        [busy]="lessonAction.busy()"
        [error]="lessonAction.error()"
        (confirmed)="deleteLesson(deleteDialog)"
      />
    </div>
  `,
})
export class TrainingModulePage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly id = input.required<string>();

  protected readonly contentTypes = LESSON_CONTENT_TYPES;
  protected readonly contentTypeChoices = dictionaryOptions(LESSON_CONTENT_TYPES);
  protected readonly data = new Loadable(() => this.api.get<ModuleDetail>(`/admin/training/modules/${this.id()}`));
  protected readonly form = new ModuleForm();
  protected readonly lessonForm = new LessonForm();
  protected readonly moduleAction = new Action();
  protected readonly lessonAction = new Action();
  protected readonly saveQuizAction = new Action();
  protected readonly pendingStatus = signal<string | null>(null);
  protected readonly deleting = signal<Lesson | null>(null);
  protected readonly quiz = signal<QuizDraft>({ title: '', passScore: 70, questions: [] });

  protected readonly pageTitle = computed(() => this.data.value()?.title ?? 'Module de formation');
  protected readonly subtitle = computed(() => {
    const d = this.data.value();
    return d ? `Mois ${d.month} du parcours · ${statusLabel('course', d.status).label}` : '';
  });
  protected readonly quizLocked = computed(() => !!this.data.value()?.quiz?.structureLocked);
  protected readonly statusTitle = computed(() => {
    const status = this.pendingStatus();
    return status === 'PUBLISHED' ? 'Publier le module' : status === 'ARCHIVED' ? 'Archiver le module' : 'Repasser en brouillon';
  });
  protected readonly statusMessage = computed(() => {
    const status = this.pendingStatus();
    if (status === 'PUBLISHED') return 'Le module et ses leçons deviennent visibles des bénéficiaires dans l’application.';
    if (status === 'ARCHIVED') return 'Le module n’est plus proposé aux membres ; leur progression et leurs résultats sont conservés.';
    return 'Le module est retiré de l’application le temps de le modifier ; la progression des membres est conservée.';
  });
  protected readonly deleteMessage = computed(() => {
    const lesson = this.deleting();
    return lesson ? `« ${lesson.title} » sera supprimée. Une leçon déjà suivie par des membres ne peut pas être supprimée.` : '';
  });

  protected readonly quizIssue = computed(() => {
    const quiz = this.quiz();
    if (!lengthBetween(quiz.title, 3, 160)) return 'Le titre du quiz doit contenir entre 3 et 160 caractères.';
    if (!isIntegerBetween(quiz.passScore, 50, 100)) return 'Le score de réussite doit être compris entre 50 et 100 %.';
    if (quiz.questions.length === 0) return 'Ajoutez au moins une question.';
    for (const [index, question] of quiz.questions.entries()) {
      const label = `Question ${index + 1} : `;
      if (!lengthBetween(question.question, 5, 500)) return `${label}l’énoncé doit contenir entre 5 et 500 caractères.`;
      if (question.options.length < 2 || question.options.length > 6) return `${label}prévoyez entre 2 et 6 options.`;
      if (question.options.some((option) => !lengthBetween(option, 1, 200))) return `${label}chaque option doit être renseignée (200 caractères maximum).`;
      if (question.correctIndex < 0 || question.correctIndex >= question.options.length) return `${label}cochez la bonne réponse.`;
      if (question.explanation.trim().length > 1000) return `${label}l’explication est limitée à 1000 caractères.`;
    }
    return null;
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.reload());
    });
  }

  protected async reload(): Promise<void> {
    await this.data.load();
    this.resetQuiz();
  }

  protected statusTargets(status: string): { status: string; label: string }[] {
    return STATUS_TARGETS[status] ?? [];
  }

  protected editModule(d: ModuleDetail, dialog: ActionDialogComponent): void {
    this.form.fill(d);
    this.moduleAction.reset();
    dialog.open();
  }

  protected async saveModule(dialog: ActionDialogComponent): Promise<void> {
    if (this.form.issue()) return;
    const result = await this.moduleAction.run(() => this.api.patch<ModuleDetail>(`/admin/training/modules/${this.id()}`, this.form.body()));
    if (!result) return;
    this.data.set(result);
    dialog.close();
    this.toast.success('Module mis à jour.');
  }

  protected askStatus(status: string, dialog: ActionDialogComponent): void {
    this.pendingStatus.set(status);
    this.moduleAction.reset();
    dialog.open();
  }

  protected async changeStatus(dialog: ActionDialogComponent): Promise<void> {
    const status = this.pendingStatus();
    if (!status) return;
    const result = await this.moduleAction.run(() => this.api.patch<ModuleDetail>(`/admin/training/modules/${this.id()}`, { status }));
    if (!result) return;
    this.data.set(result);
    dialog.close();
    this.toast.success(`Module : ${statusLabel('course', result.status).label.toLowerCase()}.`);
  }

  protected newLesson(dialog: ActionDialogComponent): void {
    this.lessonForm.fill(null);
    this.lessonAction.reset();
    dialog.open();
  }

  protected editLesson(lesson: Lesson, dialog: ActionDialogComponent): void {
    this.lessonForm.fill(lesson);
    this.lessonAction.reset();
    dialog.open();
  }

  protected async saveLesson(dialog: ActionDialogComponent): Promise<void> {
    if (this.lessonForm.issue()) return;
    const editingId = this.lessonForm.editingId();
    const body = this.lessonForm.body();
    const result = await this.lessonAction.run(() =>
      editingId
        ? this.api.patch<ModuleDetail>(`/admin/training/lessons/${editingId}`, body)
        : this.api.post<ModuleDetail>(`/admin/training/modules/${this.id()}/lessons`, body),
    );
    if (!result) return;
    this.data.set(result);
    dialog.close();
    this.toast.success(editingId ? 'Leçon mise à jour.' : 'Leçon ajoutée.');
  }

  protected askDelete(lesson: Lesson, dialog: ActionDialogComponent): void {
    this.deleting.set(lesson);
    this.lessonAction.reset();
    dialog.open();
  }

  protected async deleteLesson(dialog: ActionDialogComponent): Promise<void> {
    const lesson = this.deleting();
    if (!lesson) return;
    const result = await this.lessonAction.run(() => this.api.delete<ModuleDetail>(`/admin/training/lessons/${lesson.id}`));
    if (!result) return;
    this.data.set(result);
    dialog.close();
    this.toast.success('Leçon supprimée.');
  }

  protected resetQuiz(): void {
    const d = this.data.value();
    if (!d) return;
    this.saveQuizAction.reset();
    this.quiz.set(
      d.quiz
        ? {
            title: d.quiz.title,
            passScore: d.quiz.passScore,
            questions: d.quiz.questions.map((question) => ({
              id: question.id,
              question: question.question,
              options: [...question.options],
              correctIndex: question.correctIndex,
              explanation: question.explanation ?? '',
            })),
          }
        : { title: `Quiz — ${d.title}`.slice(0, 160), passScore: 70, questions: [] },
    );
  }

  protected patchQuiz(patch: Partial<QuizDraft>): void {
    this.quiz.update((quiz) => ({ ...quiz, ...patch }));
  }

  protected patchQuestion(index: number, patch: Partial<DraftQuestion>): void {
    this.quiz.update((quiz) => ({
      ...quiz,
      questions: quiz.questions.map((question, i) => (i === index ? { ...question, ...patch } : question)),
    }));
  }

  protected setOption(questionIndex: number, optionIndex: number, value: string): void {
    const question = this.quiz().questions[questionIndex];
    if (!question) return;
    this.patchQuestion(questionIndex, { options: question.options.map((option, i) => (i === optionIndex ? value : option)) });
  }

  protected addOption(questionIndex: number): void {
    const question = this.quiz().questions[questionIndex];
    if (!question || question.options.length >= 6) return;
    this.patchQuestion(questionIndex, { options: [...question.options, ''] });
  }

  protected removeOption(questionIndex: number, optionIndex: number): void {
    const question = this.quiz().questions[questionIndex];
    if (!question || question.options.length <= 2) return;
    const correctIndex =
      question.correctIndex === optionIndex ? 0 : question.correctIndex > optionIndex ? question.correctIndex - 1 : question.correctIndex;
    this.patchQuestion(questionIndex, { options: question.options.filter((_, i) => i !== optionIndex), correctIndex });
  }

  protected addQuestion(): void {
    this.quiz.update((quiz) => ({
      ...quiz,
      questions: [...quiz.questions, { question: '', options: ['', ''], correctIndex: 0, explanation: '' }],
    }));
  }

  protected removeQuestion(index: number): void {
    this.quiz.update((quiz) => ({ ...quiz, questions: quiz.questions.filter((_, i) => i !== index) }));
  }

  protected async saveQuiz(): Promise<void> {
    if (this.quizIssue()) return;
    const quiz = this.quiz();
    const body = {
      title: quiz.title.trim(),
      passScore: quiz.passScore,
      questions: quiz.questions.map((question) => ({
        ...(question.id ? { id: question.id } : {}),
        question: question.question.trim(),
        options: question.options.map((option) => option.trim()),
        correctIndex: question.correctIndex,
        ...(question.explanation.trim() ? { explanation: question.explanation.trim() } : {}),
      })),
    };
    const result = await this.saveQuizAction.run(() => this.api.put<ModuleDetail>(`/admin/training/modules/${this.id()}/quiz`, body));
    if (!result) return;
    this.data.set(result);
    this.resetQuiz();
    this.toast.success('Quiz enregistré.');
  }
}
