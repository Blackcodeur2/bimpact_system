import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked, WritableSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Action, Loadable, PagedList } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { fullName } from '../../core/format';
import { ROLE_NAMES } from '../../core/roles';
import { ToastService } from '../../core/toast.service';
import { lengthBetween } from '../../core/validation';
import { ActionDialogComponent } from '../../shared/action-dialog.component';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { AuditActionPipe, FrDateTimePipe, FullNamePipe, PhonePipe, RelativeTimePipe } from '../../shared/pipes';
import { BadgeComponent, StatusBadgeComponent } from '../../shared/status-badge.component';

interface StaffRow {
  id: string;
  email: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  status: string;
  roles: { code: string; name: string }[];
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  activeSessions: number;
  createdAt: string;
}

interface StaffDetail extends StaffRow {
  sessions: { id: string; createdAt: string; lastUsedAt: string | null; expiresAt: string; userAgent: string | null }[];
  recentActions: { id: string; action: string; resourceType: string; resourceId: string | null; createdAt: string }[];
}

interface RolesMatrix {
  permissions: { code: string; description: string }[];
  roles: { code: string; name: string; permissions: string[]; activeStaff: number }[];
}

interface TemporaryPassword {
  email: string;
  password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Boîte affichant une seule fois le mot de passe temporaire généré par le serveur. */
const PASSWORD_DIALOG = `
  <bi-action-dialog
    #passwordDialog
    title="Mot de passe temporaire"
    message="Transmettez-le à l'agent par un canal sûr. Il ne sera plus jamais affiché et devra être remplacé à la première connexion."
    confirmLabel="J'ai transmis le mot de passe"
    (confirmed)="temporaryPassword.set(null); passwordDialog.close()"
  >
    @if (temporaryPassword(); as secret) {
      <dl class="dl">
        <dt>Compte</dt>
        <dd>{{ secret.email }}</dd>
        <dt>Mot de passe</dt>
        <dd><code class="mono strong" style="font-size: 16px">{{ secret.password }}</code></dd>
      </dl>
      <div>
        <button type="button" class="btn btn-secondary btn-sm" (click)="copy(secret.password)">Copier le mot de passe</button>
      </div>
    }
  </bi-action-dialog>
`;

function canGrantRole(auth: AuthStore, code: string): boolean {
  return code !== 'SUPER_ADMIN' || (auth.user()?.roles ?? []).includes('SUPER_ADMIN');
}

function toggleIn(target: WritableSignal<string[]>, code: string): void {
  target.update((codes) => (codes.includes(code) ? codes.filter((item) => item !== code) : [...codes, code]));
}

async function copyToClipboard(text: string, toast: ToastService): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Mot de passe copié.');
  } catch {
    toast.error('Copie impossible : sélectionnez le mot de passe manuellement.');
  }
}

@Component({
  selector: 'bi-users-page',
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
    FullNamePipe,
    PhonePipe,
    RelativeTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header title="Utilisateurs & rôles" subtitle="Comptes internes du back-office et droits attribués. Chaque modification est tracée dans le journal d'audit.">
        @if (tab() === 'accounts') {
          <button type="button" class="btn" (click)="openCreate(createDialog)"><bi-icon name="plus" [size]="16" /> Nouvel agent</button>
        }
      </bi-page-header>

      <div class="tabs" role="tablist" style="margin-bottom: 16px">
        <button type="button" role="tab" class="tab" [class.active]="tab() === 'accounts'" [attr.aria-selected]="tab() === 'accounts'" (click)="tab.set('accounts')">
          Comptes internes
        </button>
        <button type="button" role="tab" class="tab" [class.active]="tab() === 'roles'" [attr.aria-selected]="tab() === 'roles'" (click)="tab.set('roles')">
          Matrice des rôles
        </button>
      </div>

      @if (tab() === 'accounts') {
        <section class="card">
          <form class="card-body filters" (submit)="$event.preventDefault(); list.reload()">
            <div class="field">
              <label for="users-q">Recherche</label>
              <input id="users-q" name="q" class="input" placeholder="Nom, e-mail ou téléphone" [ngModel]="q()" (ngModelChange)="q.set($event)" />
            </div>
            <div class="field">
              <label for="users-status">Statut</label>
              <select id="users-status" name="status" class="input" [ngModel]="status()" (ngModelChange)="status.set($event); list.reload()">
                <option value="">Tous</option>
                <option value="ACTIVE">Actif</option>
                <option value="SUSPENDED">Suspendu</option>
                <option value="LOCKED">Verrouillé</option>
                <option value="CLOSED">Fermé</option>
              </select>
            </div>
            <div class="field">
              <label for="users-role">Rôle</label>
              <select id="users-role" name="role" class="input" [ngModel]="role()" (ngModelChange)="role.set($event); list.reload()">
                <option value="">Tous les rôles</option>
                @for (option of roleChoices; track option.value) {
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
            emptyTitle="Aucun compte"
            emptyText="Aucun compte interne ne correspond à ces critères."
            (retry)="list.reload()"
          >
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Téléphone</th>
                    <th>Rôles</th>
                    <th>Statut</th>
                    <th class="num">Sessions</th>
                    <th>Dernière connexion</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of list.items(); track row.id) {
                    <tr class="clickable" (click)="open(row.id)">
                      <td>
                        <a class="cell-title" [routerLink]="['/utilisateurs', row.id]" (click)="$event.stopPropagation()">{{ row | fullName }}</a>
                        <div class="cell-sub">{{ row.email }}</div>
                      </td>
                      <td class="nowrap">{{ row.phone | phone }}</td>
                      <td>
                        <div class="row" style="gap: 4px">
                          @for (item of row.roles; track item.code) {
                            <span class="badge badge-plain">{{ item.name }}</span>
                          }
                        </div>
                      </td>
                      <td>
                        <div class="row" style="gap: 4px">
                          <bi-status domain="user" [code]="row.status" />
                          @if (row.lockedUntil) {
                            <bi-badge tone="warning">Verrouillé</bi-badge>
                          }
                          @if (row.mustChangePassword) {
                            <bi-badge tone="info">Mot de passe temporaire</bi-badge>
                          }
                        </div>
                      </td>
                      <td class="num">{{ row.activeSessions }}</td>
                      <td class="nowrap">{{ row.lastLoginAt | ago }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <bi-load-more [list]="list" />
          </bi-async>
        </section>
      } @else {
        <bi-async [loading]="roles.loading()" [error]="roles.error()" [hasContent]="!!roles.value()" (retry)="roles.load()">
          @if (roles.value(); as matrix) {
            <section class="card">
              <div class="card-header">
                <h3>Permissions par rôle</h3>
                <span class="muted small">Définies dans le code de l’API : lecture seule</span>
              </div>
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Permission</th>
                      @for (item of matrix.roles; track item.code) {
                        <th class="center">
                          {{ item.name }}
                          <div class="cell-sub" style="text-transform: none">{{ item.activeStaff }} actif(s)</div>
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (permission of matrix.permissions; track permission.code) {
                      <tr>
                        <td>
                          <div class="mono">{{ permission.code }}</div>
                          <div class="cell-sub">{{ permission.description }}</div>
                        </td>
                        @for (item of matrix.roles; track item.code) {
                          <td class="center">
                            @if (item.permissions.includes(permission.code)) {
                              <bi-icon name="check" [size]="16" />
                            }
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }
        </bi-async>
      }

      <bi-action-dialog
        #createDialog
        title="Nouvel agent"
        message="Un mot de passe temporaire est généré et affiché une seule fois ; l'agent devra le remplacer à sa première connexion."
        confirmLabel="Créer le compte"
        [wide]="true"
        [valid]="!createIssue()"
        [busy]="create.busy()"
        [error]="create.error()"
        (confirmed)="createStaff(createDialog, passwordDialog)"
      >
        <div class="grid grid-2">
          <div class="field">
            <label for="staff-first">Prénom</label>
            <input id="staff-first" name="staffFirst" class="input" maxlength="60" [ngModel]="firstName()" (ngModelChange)="firstName.set($event)" />
          </div>
          <div class="field">
            <label for="staff-last">Nom</label>
            <input id="staff-last" name="staffLast" class="input" maxlength="60" [ngModel]="lastName()" (ngModelChange)="lastName.set($event)" />
          </div>
          <div class="field">
            <label for="staff-email">E-mail professionnel</label>
            <input id="staff-email" name="staffEmail" type="email" class="input" autocomplete="off" [ngModel]="email()" (ngModelChange)="email.set($event)" />
          </div>
          <div class="field">
            <label for="staff-phone">Téléphone mobile</label>
            <input id="staff-phone" name="staffPhone" class="input" placeholder="6 12 34 56 78" [ngModel]="phone()" (ngModelChange)="phone.set($event)" />
          </div>
          <div class="field">
            <label for="staff-city">Ville (facultatif)</label>
            <input id="staff-city" name="staffCity" class="input" maxlength="60" [ngModel]="city()" (ngModelChange)="city.set($event)" />
          </div>
        </div>
        <fieldset class="stack-sm" style="border: 0; padding: 0; margin: 0">
          <legend class="strong" style="margin-bottom: 6px">Rôles</legend>
          @for (item of roles.value()?.roles ?? []; track item.code) {
            <label class="checkbox">
              <input type="checkbox" [checked]="createRoles().includes(item.code)" [disabled]="!canGrant(item.code)" (change)="toggleRole(createRoles, item.code)" />
              {{ item.name }} <span class="muted small">— {{ item.permissions.length }} permission(s)</span>
            </label>
          }
        </fieldset>
        @if (createIssue(); as issue) {
          <p class="hint">{{ issue }}</p>
        }
      </bi-action-dialog>

      ${PASSWORD_DIALOG}
    </div>
  `,
})
export class UsersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthStore);

  protected readonly tab = signal<'accounts' | 'roles'>('accounts');
  protected readonly roleChoices = Object.entries(ROLE_NAMES).map(([value, label]) => ({ value, label }));
  protected readonly q = signal('');
  protected readonly status = signal('');
  protected readonly role = signal('');
  protected readonly list = new PagedList<StaffRow>((cursor) =>
    this.api.get<Page<StaffRow>>('/admin/users', { q: this.q().trim(), status: this.status(), role: this.role(), cursor, limit: 25 }),
  );
  protected readonly roles = new Loadable(() => this.api.get<RolesMatrix>('/admin/roles'));

  protected readonly create = new Action();
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');
  protected readonly city = signal('');
  protected readonly createRoles = signal<string[]>([]);
  protected readonly temporaryPassword = signal<TemporaryPassword | null>(null);

  protected readonly createIssue = computed(() => {
    if (!lengthBetween(this.firstName(), 2, 60) || !lengthBetween(this.lastName(), 2, 60)) return 'Prénom et nom : entre 2 et 60 caractères.';
    if (!EMAIL_RE.test(this.email().trim())) return 'Adresse e-mail invalide.';
    if (this.phone().replace(/\D/g, '').length < 9) return 'Numéro de téléphone mobile camerounais attendu.';
    const city = this.city().trim();
    if (city && !lengthBetween(city, 2, 60)) return 'La ville doit contenir entre 2 et 60 caractères.';
    if (this.createRoles().length === 0) return 'Attribuez au moins un rôle.';
    return null;
  });

  ngOnInit(): void {
    void this.list.reload();
    void this.roles.load();
  }

  protected open(id: string): void {
    void this.router.navigate(['/utilisateurs', id]);
  }

  protected canGrant(code: string): boolean {
    return canGrantRole(this.auth, code);
  }

  protected toggleRole(target: WritableSignal<string[]>, code: string): void {
    toggleIn(target, code);
  }

  protected copy(text: string): Promise<void> {
    return copyToClipboard(text, this.toast);
  }

  protected openCreate(dialog: ActionDialogComponent): void {
    this.create.reset();
    this.firstName.set('');
    this.lastName.set('');
    this.email.set('');
    this.phone.set('');
    this.city.set('');
    this.createRoles.set([]);
    dialog.open();
  }

  protected async createStaff(dialog: ActionDialogComponent, passwordDialog: ActionDialogComponent): Promise<void> {
    if (this.createIssue()) return;
    const city = this.city().trim();
    const result = await this.create.run(() =>
      this.api.post<{ user: StaffDetail; temporaryPassword: string }>('/admin/users', {
        firstName: this.firstName().trim(),
        lastName: this.lastName().trim(),
        email: this.email().trim(),
        phone: this.phone().trim(),
        ...(city ? { city } : {}),
        roles: this.createRoles(),
      }),
    );
    if (!result) return;
    dialog.close();
    this.temporaryPassword.set({ email: result.user.email, password: result.temporaryPassword });
    passwordDialog.open();
    this.toast.success(`Compte de ${fullName(result.user)} créé.`);
    void this.list.reload();
  }
}

@Component({
  selector: 'bi-user-detail-page',
  imports: [
    ActionDialogComponent,
    AsyncStateComponent,
    IconComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    BadgeComponent,
    AuditActionPipe,
    FrDateTimePipe,
    PhonePipe,
    RelativeTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header [title]="pageTitle()" [subtitle]="data.value()?.email ?? ''" backLink="/utilisateurs" backLabel="Utilisateurs & rôles">
        @if (data.value(); as d) {
          <button type="button" class="btn btn-secondary" (click)="openRoles(d, rolesDialog)"><bi-icon name="key" [size]="16" /> Rôles</button>
          @if (!isSelf()) {
            @if (d.status === 'ACTIVE') {
              <button type="button" class="btn btn-danger" (click)="action.reset(); suspendDialog.open()">Suspendre</button>
            }
            @if (d.status === 'SUSPENDED') {
              <button type="button" class="btn btn-success" (click)="action.reset(); activateDialog.open()">Réactiver</button>
            }
            <button type="button" class="btn btn-secondary" (click)="action.reset(); resetDialog.open()"><bi-icon name="lock" [size]="16" /> Réinitialiser le mot de passe</button>
          }
          @if (d.lockedUntil) {
            <button type="button" class="btn btn-secondary" [disabled]="action.busy()" (click)="unlock()">Déverrouiller</button>
          }
        }
      </bi-page-header>

      <bi-async [loading]="data.loading()" [error]="data.error()" [hasContent]="!!data.value()" (retry)="data.load()">
        @if (data.value(); as d) {
          <div class="stack">
            @if (action.error() && !dialogOpen()) {
              <div class="alert alert-danger" role="alert">{{ action.error() }}</div>
            }
            <div class="grid grid-main-side">
              <div class="stack">
                <section class="card">
                  <div class="card-header">
                    <h3>Sessions actives</h3>
                    @if (d.sessions.length > 0) {
                      <button type="button" class="btn btn-secondary btn-sm" (click)="action.reset(); revokeAllDialog.open()">Fermer toutes les sessions</button>
                    }
                  </div>
                  <div class="table-wrap">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Ouverte le</th>
                          <th>Dernière activité</th>
                          <th>Navigateur</th>
                          <th>Expire le</th>
                          <th><span class="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (session of d.sessions; track session.id) {
                          <tr>
                            <td class="nowrap">{{ session.createdAt | frDateTime }}</td>
                            <td class="nowrap">{{ session.lastUsedAt | ago }}</td>
                            <td class="small break">{{ session.userAgent ?? '—' }}</td>
                            <td class="nowrap">{{ session.expiresAt | frDateTime }}</td>
                            <td>
                              <button type="button" class="btn btn-ghost btn-sm" [disabled]="action.busy()" (click)="revokeSession(session.id)">Fermer</button>
                            </td>
                          </tr>
                        } @empty {
                          <tr>
                            <td colspan="5" class="muted">Aucune session active.</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </section>

                <section class="card">
                  <div class="card-header"><h3>Actions récentes</h3></div>
                  <div class="card-body">
                    <ul class="timeline">
                      @for (entry of d.recentActions; track entry.id) {
                        <li>
                          <div class="strong">{{ entry.action | auditAction }}</div>
                          <div class="small muted">{{ entry.resourceType }} · {{ entry.createdAt | frDateTime }}</div>
                        </li>
                      } @empty {
                        <p class="muted small">Aucune action enregistrée.</p>
                      }
                    </ul>
                  </div>
                </section>
              </div>

              <section class="card">
                <div class="card-header">
                  <h3>Compte</h3>
                  <bi-status domain="user" [code]="d.status" />
                </div>
                <div class="card-body">
                  <dl class="dl">
                    <dt>E-mail</dt>
                    <dd>{{ d.email }}</dd>
                    <dt>Téléphone</dt>
                    <dd>{{ d.phone | phone }}</dd>
                    <dt>Ville</dt>
                    <dd>{{ d.city ?? '—' }}</dd>
                    <dt>Rôles</dt>
                    <dd>
                      <div class="row" style="gap: 4px">
                        @for (item of d.roles; track item.code) {
                          <span class="badge badge-plain">{{ item.name }}</span>
                        }
                      </div>
                    </dd>
                    <dt>Mot de passe</dt>
                    <dd>
                      @if (d.mustChangePassword) {
                        <bi-badge tone="info">Temporaire, à remplacer</bi-badge>
                      } @else {
                        Changé le {{ d.passwordChangedAt | frDateTime }}
                      }
                    </dd>
                    @if (d.lockedUntil) {
                      <dt>Verrouillé jusqu’au</dt>
                      <dd>{{ d.lockedUntil | frDateTime }}</dd>
                    }
                    <dt>Dernière connexion</dt>
                    <dd>{{ d.lastLoginAt | frDateTime }}</dd>
                    <dt>Créé le</dt>
                    <dd>{{ d.createdAt | frDateTime }}</dd>
                  </dl>
                </div>
              </section>
            </div>
          </div>
        }
      </bi-async>

      <bi-action-dialog
        #rolesDialog
        title="Rôles de l'agent"
        message="Les droits effectifs changent dès la prochaine requête de l'agent."
        confirmLabel="Enregistrer les rôles"
        [valid]="editRoles().length > 0"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="saveRoles(rolesDialog)"
      >
        <div class="stack-sm">
          @for (item of roles.value()?.roles ?? []; track item.code) {
            <label class="checkbox">
              <input type="checkbox" [checked]="editRoles().includes(item.code)" [disabled]="!canGrant(item.code)" (change)="toggleRole(editRoles, item.code)" />
              {{ item.name }} <span class="muted small">— {{ item.permissions.length }} permission(s)</span>
            </label>
          }
          @if (isSelf()) {
            <p class="hint">Vous ne pouvez pas retirer vos propres droits de gestion des comptes.</p>
          }
        </div>
      </bi-action-dialog>

      <bi-action-dialog
        #suspendDialog
        title="Suspendre le compte"
        message="L'agent est déconnecté immédiatement et ne peut plus se connecter."
        confirmLabel="Suspendre"
        tone="danger"
        reasonLabel="Motif (conservé dans le journal d'audit)"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="setStatus('SUSPENDED', $event, suspendDialog)"
      />
      <bi-action-dialog
        #activateDialog
        title="Réactiver le compte"
        confirmLabel="Réactiver"
        tone="success"
        reasonLabel="Motif (conservé dans le journal d'audit)"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="setStatus('ACTIVE', $event, activateDialog)"
      />
      <bi-action-dialog
        #resetDialog
        title="Réinitialiser le mot de passe"
        message="Un nouveau mot de passe temporaire est généré, toutes les sessions de l'agent sont fermées et il devra le remplacer à sa prochaine connexion."
        confirmLabel="Réinitialiser"
        tone="danger"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="resetPassword(resetDialog, passwordDialog)"
      />
      <bi-action-dialog
        #revokeAllDialog
        title="Fermer toutes les sessions"
        message="L'agent devra se reconnecter sur tous ses appareils."
        confirmLabel="Fermer les sessions"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="revokeAll(revokeAllDialog)"
      />

      ${PASSWORD_DIALOG}
    </div>
  `,
})
export class UserDetailPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthStore);

  readonly id = input.required<string>();

  protected readonly data = new Loadable(() => this.api.get<StaffDetail>(`/admin/users/${this.id()}`));
  protected readonly roles = new Loadable(() => this.api.get<RolesMatrix>('/admin/roles'));
  protected readonly action = new Action();
  protected readonly editRoles = signal<string[]>([]);
  protected readonly temporaryPassword = signal<TemporaryPassword | null>(null);
  protected readonly dialogOpen = signal(false);

  protected readonly pageTitle = computed(() => {
    const d = this.data.value();
    return d ? fullName(d) : 'Compte interne';
  });
  protected readonly isSelf = computed(() => this.auth.user()?.id === this.id());

  constructor() {
    void this.roles.load();
    effect(() => {
      this.id();
      untracked(() => void this.data.load());
    });
  }

  protected canGrant(code: string): boolean {
    return canGrantRole(this.auth, code);
  }

  protected toggleRole(target: WritableSignal<string[]>, code: string): void {
    toggleIn(target, code);
  }

  protected copy(text: string): Promise<void> {
    return copyToClipboard(text, this.toast);
  }

  protected openRoles(d: StaffDetail, dialog: ActionDialogComponent): void {
    this.action.reset();
    this.editRoles.set(d.roles.map((item) => item.code));
    this.dialogOpen.set(true);
    dialog.open();
  }

  protected async saveRoles(dialog: ActionDialogComponent): Promise<void> {
    await this.update({ roles: this.editRoles() }, dialog, 'Rôles mis à jour.');
  }

  protected async setStatus(status: 'ACTIVE' | 'SUSPENDED', reason: string, dialog: ActionDialogComponent): Promise<void> {
    await this.update({ status, reason }, dialog, status === 'SUSPENDED' ? 'Compte suspendu : ses sessions sont fermées.' : 'Compte réactivé.');
  }

  protected async resetPassword(dialog: ActionDialogComponent, passwordDialog: ActionDialogComponent): Promise<void> {
    const result = await this.action.run(() =>
      this.api.post<{ user: StaffDetail; temporaryPassword: string }>(`/admin/users/${this.id()}/reset-password`),
    );
    if (!result) return;
    this.data.set(result.user);
    dialog.close();
    this.temporaryPassword.set({ email: result.user.email, password: result.temporaryPassword });
    passwordDialog.open();
  }

  protected async unlock(): Promise<void> {
    this.dialogOpen.set(false);
    const result = await this.action.run(() => this.api.post<StaffDetail>(`/admin/users/${this.id()}/unlock`));
    if (!result) return;
    this.data.set(result);
    this.toast.success('Compte déverrouillé.');
  }

  protected async revokeSession(sessionId: string): Promise<void> {
    this.dialogOpen.set(false);
    const result = await this.action.run(() => this.api.post<StaffDetail>(`/admin/users/${this.id()}/revoke-session`, { sessionId }));
    if (!result) return;
    this.data.set(result);
    this.toast.success('Session fermée.');
  }

  protected async revokeAll(dialog: ActionDialogComponent): Promise<void> {
    const result = await this.action.run(() => this.api.post<StaffDetail>(`/admin/users/${this.id()}/revoke-session`, {}));
    if (!result) return;
    this.data.set(result);
    dialog.close();
    this.toast.success('Toutes les sessions sont fermées.');
  }

  private async update(body: object, dialog: ActionDialogComponent, message: string): Promise<void> {
    const result = await this.action.run(() => this.api.patch<StaffDetail>(`/admin/users/${this.id()}`, body));
    if (!result) return;
    this.data.set(result);
    this.dialogOpen.set(false);
    dialog.close();
    this.toast.success(message);
  }
}
