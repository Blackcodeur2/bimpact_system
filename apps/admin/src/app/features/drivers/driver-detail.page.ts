import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Money } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Action, Loadable } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { fullName } from '../../core/format';
import { CHANNEL_LABELS, dictionaryOptions, RISK_FLAG_LABELS, SIGNAL_LABELS } from '../../core/labels';
import { ToastService } from '../../core/toast.service';
import { ActionDialogComponent } from '../../shared/action-dialog.component';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DictionaryLabelPipe, FrDatePipe, FrDateTimePipe, MoneyPipe, PhonePipe, RelativeTimePipe } from '../../shared/pipes';
import { BadgeComponent, StatusBadgeComponent } from '../../shared/status-badge.component';

interface Note {
  id: string;
  body: string;
  authorId: string;
  authorName: string | null;
  createdAt: string;
}

interface DriverDetail {
  id: string;
  phone: string;
  status: string;
  lockedUntil: string | null;
  failedLoginCount: number;
  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  profile: { firstName: string | null; lastName: string | null; city: string | null; zone: string | null };
  kyc: { id: string | null; status: string; submittedAt: string | null; reviewedAt: string | null; riskFlags: string[]; lastDecisionReason: string | null };
  wallet: { available: Money | null; reserved: Money | null };
  contributions: {
    plan: { status: string; autoDebit: boolean; amount: Money; startedOn: string } | null;
    paidDaysLast30: number;
    totalCount: number;
    totalAmount: Money;
  };
  maintenanceFee?: {
    month: string;
    isPaid: boolean;
    amount: Money;
    paidAt: string | null;
  };
  program: {
    beneficiary: { id: string; status: string; mentorName: string | null; selectedAt: string; draw: { id: string; code: string; title: string } } | null;
    completedLessons: number;
    certificate: { id: string; certificateNumber: string; issuedAt: string; revokedAt: string | null } | null;
    solidarity: { status: string; joinedAt: string; leftAt: string | null } | null;
  };
  projects: { id: string; title: string; status: string; updatedAt: string }[];
  accidents: { id: string; reference: string; status: string; createdAt: string }[];
  tickets: { id: string; reference: string; subject: string; status: string; lastMessageAt: string }[];
  payments: { id: string; status: string; channel: string; amount: Money; createdAt: string }[];
  security: {
    activeSessions: number;
    devices: { id: string; platform: string; model: string | null; appVersion: string | null; lastSeenAt: string; revokedAt: string | null }[];
  };
  riskCases: { id: string; reference: string; status: string; signalType: string; createdAt: string }[];
  notes: Note[];
}

@Component({
  selector: 'bi-driver-detail-page',
  imports: [
    FormsModule,
    RouterLink,
    ActionDialogComponent,
    AsyncStateComponent,
    IconComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    BadgeComponent,
    DictionaryLabelPipe,
    FrDatePipe,
    FrDateTimePipe,
    MoneyPipe,
    PhonePipe,
    RelativeTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .note {
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--neutral-50);
      border: 1px solid var(--neutral-100);
    }
    .list-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 8px 0;
      border-bottom: 1px solid var(--neutral-100);
    }
    .list-line:last-child {
      border-bottom: none;
    }
  `,
  template: `
    <div class="page">
      <bi-page-header
        [title]="title()"
        subtitle="Fiche complète du conducteur. Chaque consultation est tracée dans le journal d'audit."
        backLink="/conducteurs"
        backLabel="Conducteurs"
      >
        @if (data.value(); as d) {
          @if (auth.can('admin.drivers.update_status')) {
            @if (d.lockedUntil) {
              <button type="button" class="btn btn-secondary" (click)="action.reset(); unlockDialog.open()">
                <bi-icon name="lock" [size]="16" /> Déverrouiller
              </button>
            }
            @if (d.status === 'SUSPENDED' || d.status === 'LOCKED') {
              <button type="button" class="btn btn-success" (click)="action.reset(); activateDialog.open()">
                <bi-icon name="check" [size]="16" /> Réactiver
              </button>
            }
            @if (d.status === 'ACTIVE' || d.status === 'LOCKED') {
              <button type="button" class="btn btn-danger" (click)="action.reset(); suspendDialog.open()">
                <bi-icon name="x" [size]="16" /> Suspendre
              </button>
            }
          }
          @if (auth.can('admin.fraud.act')) {
            <button type="button" class="btn btn-secondary" (click)="action.reset(); riskSignal.set('MANUAL'); riskDialog.open()">
              <bi-icon name="alert" [size]="16" /> Signaler un risque
            </button>
          }
          @if (auth.can('admin.audit.read')) {
            <a class="btn btn-ghost" routerLink="/audit" [queryParams]="{ resourceId: d.id }"><bi-icon name="history" [size]="16" /> Journal</a>
          }
        }
      </bi-page-header>

      <bi-async [loading]="data.loading()" [error]="data.error()" [hasContent]="!!data.value()" (retry)="data.load()">
        @if (data.value(); as d) {
          <div class="stack">
            <div class="grid grid-4">
              <div class="card kpi">
                <span class="kpi-label">Solde disponible</span>
                <span class="kpi-value">{{ d.wallet.available | xaf }}</span>
                <span class="kpi-sub">Réservé : {{ d.wallet.reserved | xaf }}</span>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Contributions sur 30 jours</span>
                <span class="kpi-value">{{ d.contributions.paidDaysLast30 }} / 30</span>
                <span class="kpi-sub">{{ d.contributions.totalCount }} au total · {{ d.contributions.totalAmount | xaf }}</span>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Formation</span>
                <span class="kpi-value">{{ d.program.completedLessons }}</span>
                <span class="kpi-sub">leçon(s) terminée(s)</span>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Sessions actives</span>
                <span class="kpi-value">{{ d.security.activeSessions }}</span>
                <span class="kpi-sub">{{ d.security.devices.length }} appareil(s) connu(s)</span>
              </div>
            </div>

            <div class="grid grid-main-side">
              <div class="stack">
                <section class="card">
                  <div class="card-header">
                    <h3>Compte et identité</h3>
                    @if (d.kyc.id && auth.can('admin.kyc.read')) {
                      <a class="small" [routerLink]="['/kyc', d.kyc.id]">Ouvrir le dossier d’identité</a>
                    }
                  </div>
                  <div class="card-body">
                    <dl class="dl">
                      <dt>Téléphone</dt>
                      <dd>{{ d.phone | phone }}</dd>
                      <dt>Ville / zone</dt>
                      <dd>{{ d.profile.city ?? '—' }}{{ d.profile.zone ? ' · ' + d.profile.zone : '' }}</dd>
                      <dt>Statut du compte</dt>
                      <dd>
                        <bi-status domain="user" [code]="d.status" />
                        @if (d.lockedUntil) {
                          <span class="small muted"> verrouillé jusqu’au {{ d.lockedUntil | frDateTime }}</span>
                        }
                      </dd>
                      <dt>Vérification d’identité</dt>
                      <dd><bi-status domain="kyc" [code]="d.kyc.status" /></dd>
                      @if (d.kyc.lastDecisionReason) {
                        <dt>Dernier motif</dt>
                        <dd>{{ d.kyc.lastDecisionReason }}</dd>
                      }
                      @if (d.kyc.riskFlags.length > 0) {
                        <dt>Alertes</dt>
                        <dd>
                          <div class="row" style="gap: 6px">
                            @for (flag of d.kyc.riskFlags; track flag) {
                              <bi-badge tone="warning">{{ flag | label: riskFlagLabels }}</bi-badge>
                            }
                          </div>
                        </dd>
                      }
                      <dt>Téléphone vérifié le</dt>
                      <dd>{{ d.phoneVerifiedAt | frDateTime }}</dd>
                      <dt>Inscription</dt>
                      <dd>{{ d.createdAt | frDateTime }}</dd>
                      <dt>Dernière connexion</dt>
                      <dd>{{ d.lastLoginAt | frDateTime }}</dd>
                      <dt>Échecs de code PIN</dt>
                      <dd>{{ d.failedLoginCount }}</dd>
                    </dl>
                  </div>
                </section>

                <section class="card">
                  <div class="card-header"><h3>Programme et contributions</h3></div>
                  <div class="card-body">
                    <dl class="dl">
                      <dt>Plan de contribution</dt>
                      <dd>
                        @if (d.contributions.plan; as plan) {
                          <bi-status domain="plan" [code]="plan.status" />
                          {{ plan.amount | xaf }} / jour · prélèvement automatique {{ plan.autoDebit ? 'activé' : 'désactivé' }} · depuis le
                          {{ plan.startedOn | frDate }}
                        } @else {
                          Aucun plan
                        }
                      </dd>
                      <dt>Frais d'entretien</dt>
                      <dd>
                        @if (d.maintenanceFee; as fee) {
                          @if (fee.isPaid) {
                            <bi-badge tone="success">À jour ({{ fee.amount | xaf }})</bi-badge>
                            · mois de {{ fee.month }}
                          } @else {
                            <bi-badge tone="danger">Non réglé ({{ fee.amount | xaf }}) — Inéligible au tirage</bi-badge>
                            @if (auth.can('admin.drivers.update_status')) {
                              <button type="button" class="btn btn-sm btn-secondary" style="margin-left: 8px; padding: 2px 8px; font-size: 12px;" (click)="maintenanceFeeDialog.open()">
                                Encaisser / Régler
                              </button>
                            }
                          }
                        } @else {
                          <bi-badge tone="neutral">Non configuré</bi-badge>
                        }
                      </dd>
                      <dt>Bénéficiaire</dt>
                      <dd>
                        @if (d.program.beneficiary; as b) {
                          <bi-status domain="beneficiary" [code]="b.status" />
                          tirage {{ b.draw.code }} du {{ b.selectedAt | frDate }}{{ b.mentorName ? ' · mentor : ' + b.mentorName : '' }}
                        } @else {
                          Non sélectionné
                        }
                      </dd>
                      <dt>Certificat</dt>
                      <dd>
                        @if (d.program.certificate; as c) {
                          {{ c.certificateNumber }} · délivré le {{ c.issuedAt | frDate }}
                          @if (c.revokedAt) {
                            <bi-badge tone="danger">Révoqué</bi-badge>
                          }
                        } @else {
                          Aucun
                        }
                      </dd>
                      <dt>Solidarité volontaire</dt>
                      <dd>
                        @if (d.program.solidarity; as s) {
                          <bi-status domain="solidarity" [code]="s.status" /> depuis le {{ s.joinedAt | frDate }}
                        } @else {
                          Non adhérent
                        }
                      </dd>
                    </dl>
                  </div>
                </section>

                <section class="card">
                  <div class="card-header"><h3>Derniers rechargements</h3></div>
                  <div class="table-wrap">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Moyen</th>
                          <th class="num">Montant</th>
                          <th>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (payment of d.payments; track payment.id) {
                          <tr>
                            <td class="nowrap">
                              @if (auth.can('admin.payments.read')) {
                                <a [routerLink]="['/paiements', payment.id]">{{ payment.createdAt | frDateTime }}</a>
                              } @else {
                                {{ payment.createdAt | frDateTime }}
                              }
                            </td>
                            <td>{{ payment.channel | label: channelLabels }}</td>
                            <td class="num nowrap">{{ payment.amount | xaf }}</td>
                            <td><bi-status domain="payment" [code]="payment.status" /></td>
                          </tr>
                        } @empty {
                          <tr>
                            <td colspan="4" class="muted">Aucun rechargement.</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </section>

                <div class="grid grid-3">
                  <section class="card">
                    <div class="card-header"><h3>Projets</h3></div>
                    <div class="card-body">
                      @for (project of d.projects; track project.id) {
                        <div class="list-line">
                          @if (auth.can('admin.projects.read')) {
                            <a [routerLink]="['/projets', project.id]">{{ project.title }}</a>
                          } @else {
                            <span>{{ project.title }}</span>
                          }
                          <bi-status domain="project" [code]="project.status" />
                        </div>
                      } @empty {
                        <p class="muted small">Aucun projet.</p>
                      }
                    </div>
                  </section>
                  <section class="card">
                    <div class="card-header"><h3>Accidents</h3></div>
                    <div class="card-body">
                      @for (claim of d.accidents; track claim.id) {
                        <div class="list-line">
                          @if (auth.can('admin.accidents.read')) {
                            <a class="mono" [routerLink]="['/accidents', claim.id]">{{ claim.reference }}</a>
                          } @else {
                            <span class="mono">{{ claim.reference }}</span>
                          }
                          <bi-status domain="accident" [code]="claim.status" />
                        </div>
                      } @empty {
                        <p class="muted small">Aucune déclaration.</p>
                      }
                    </div>
                  </section>
                  <section class="card">
                    <div class="card-header"><h3>Support</h3></div>
                    <div class="card-body">
                      @for (ticket of d.tickets; track ticket.id) {
                        <div class="list-line">
                          @if (auth.can('admin.support.manage')) {
                            <a [routerLink]="['/support', ticket.id]">{{ ticket.subject }}</a>
                          } @else {
                            <span>{{ ticket.subject }}</span>
                          }
                          <bi-status domain="ticket" [code]="ticket.status" />
                        </div>
                      } @empty {
                        <p class="muted small">Aucune demande.</p>
                      }
                    </div>
                  </section>
                </div>
              </div>

              <div class="stack">
                <section class="card">
                  <div class="card-header"><h3>Notes internes</h3></div>
                  <div class="card-body stack">
                    <form class="stack-sm" (submit)="$event.preventDefault(); addNote()">
                      <textarea
                        class="input"
                        name="note"
                        rows="3"
                        placeholder="Visible uniquement par l’équipe. Une note ne peut plus être modifiée."
                        [ngModel]="noteBody()"
                        (ngModelChange)="noteBody.set($event)"
                      ></textarea>
                      @if (noteAction.error(); as err) {
                        <span class="field-error">{{ err }}</span>
                      }
                      <div>
                        <button type="submit" class="btn btn-secondary btn-sm" [disabled]="noteAction.busy() || noteBody().trim().length < 3">
                          Ajouter la note
                        </button>
                      </div>
                    </form>
                    @for (note of d.notes; track note.id) {
                      <div class="note">
                        <div class="small muted">{{ note.authorName ?? 'Agent' }} · {{ note.createdAt | frDateTime }}</div>
                        <p class="pre-line break">{{ note.body }}</p>
                      </div>
                    } @empty {
                      <p class="muted small">Aucune note.</p>
                    }
                  </div>
                </section>

                <section class="card">
                  <div class="card-header"><h3>Dossiers de risque</h3></div>
                  <div class="card-body">
                    @for (riskCase of d.riskCases; track riskCase.id) {
                      <div class="list-line">
                        <div>
                          @if (auth.can('admin.fraud.read')) {
                            <a class="mono" [routerLink]="['/risque/dossiers', riskCase.id]">{{ riskCase.reference }}</a>
                          } @else {
                            <span class="mono">{{ riskCase.reference }}</span>
                          }
                          <div class="cell-sub">{{ riskCase.signalType | label: signalLabels }} · {{ riskCase.createdAt | frDate }}</div>
                        </div>
                        <bi-status domain="risk" [code]="riskCase.status" />
                      </div>
                    } @empty {
                      <p class="muted small">Aucun dossier.</p>
                    }
                  </div>
                </section>

                <section class="card">
                  <div class="card-header"><h3>Appareils</h3></div>
                  <div class="card-body">
                    @for (device of d.security.devices; track device.id) {
                      <div class="list-line">
                        <div>
                          <div class="strong">{{ device.model ?? device.platform }}</div>
                          <div class="cell-sub">{{ device.platform }} · version {{ device.appVersion ?? '—' }} · vu {{ device.lastSeenAt | ago }}</div>
                        </div>
                        @if (device.revokedAt) {
                          <bi-badge>Révoqué</bi-badge>
                        }
                      </div>
                    } @empty {
                      <p class="muted small">Aucun appareil enregistré.</p>
                    }
                  </div>
                </section>
              </div>
            </div>
          </div>
        }
      </bi-async>

      <bi-action-dialog
        #suspendDialog
        title="Suspendre le compte"
        message="Le conducteur ne pourra plus se connecter et toutes ses sessions seront fermées immédiatement."
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
        message="Le conducteur pourra de nouveau se connecter ; les échecs de code PIN sont remis à zéro."
        confirmLabel="Réactiver"
        tone="success"
        reasonLabel="Motif (conservé dans le journal d'audit)"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="setStatus('ACTIVE', $event, activateDialog)"
      />
      <bi-action-dialog
        #unlockDialog
        title="Déverrouiller le compte"
        message="Le verrouillage temporaire consécutif aux codes PIN erronés est levé."
        confirmLabel="Déverrouiller"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="unlock(unlockDialog)"
      />
      <bi-action-dialog
        #riskDialog
        title="Ouvrir un dossier de risque"
        message="Le dossier est suivi dans Fraude & risque ; chaque action y est documentée."
        confirmLabel="Ouvrir le dossier"
        reasonLabel="Résumé des faits constatés"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="openRiskCase($event, riskDialog)"
      >
        <div class="field">
          <label for="driver-risk-signal">Type de signal</label>
          <select id="driver-risk-signal" name="riskSignal" class="input" [ngModel]="riskSignal()" (ngModelChange)="riskSignal.set($event)">
            @for (entry of signalChoices; track entry.value) {
              <option [value]="entry.value">{{ entry.label }}</option>
            }
          </select>
        </div>
      </bi-action-dialog>
      <bi-action-dialog
        #maintenanceFeeDialog
        title="Régler les frais d’entretien mensuels"
        message="Les frais d’entretien mensuels (500 FCFA) permettent au conducteur d’être éligible aux tirages au sort."
        confirmLabel="Confirmer le règlement"
        tone="primary"
        reasonLabel="Note ou référence facultative"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="payMaintenanceFee($event, maintenanceFeeDialog)"
      >
        <div class="field">
          <label for="fee-source">Mode de règlement</label>
          <select id="fee-source" name="feeSource" class="input" [ngModel]="feeSource()" (ngModelChange)="feeSource.set($event)">
            <option value="WALLET">Débit du portefeuille (solde disponible)</option>
            <option value="MANUAL">Règlement manuel (espèces / hors plateforme)</option>
          </select>
        </div>
      </bi-action-dialog>
    </div>
  `,
})
export class DriverDetailPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthStore);

  readonly id = input.required<string>();

  protected readonly riskFlagLabels = RISK_FLAG_LABELS;
  protected readonly signalLabels = SIGNAL_LABELS;
  protected readonly channelLabels = CHANNEL_LABELS;
  protected readonly signalChoices = dictionaryOptions(SIGNAL_LABELS);

  protected readonly data = new Loadable(() => this.api.get<DriverDetail>(`/admin/drivers/${this.id()}`));
  protected readonly action = new Action();
  protected readonly noteAction = new Action();
  protected readonly noteBody = signal('');
  protected readonly riskSignal = signal('MANUAL');

  protected readonly title = computed(() => {
    const d = this.data.value();
    if (!d) return 'Fiche conducteur';
    const name = fullName(d.profile);
    return name === '—' ? 'Conducteur sans nom' : name;
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.data.load());
    });
  }

  protected async setStatus(status: 'ACTIVE' | 'SUSPENDED', reason: string, dialog: ActionDialogComponent): Promise<void> {
    const result = await this.action.run(() => this.api.patch<DriverDetail>(`/admin/drivers/${this.id()}/status`, { status, reason }));
    if (!result) return;
    this.data.set(result);
    dialog.close();
    this.toast.success(status === 'SUSPENDED' ? 'Compte suspendu : ses sessions sont fermées.' : 'Compte réactivé.');
  }

  protected async unlock(dialog: ActionDialogComponent): Promise<void> {
    const result = await this.action.run(() => this.api.post<DriverDetail>(`/admin/drivers/${this.id()}/unlock`));
    if (!result) return;
    this.data.set(result);
    dialog.close();
    this.toast.success('Compte déverrouillé.');
  }

  protected async addNote(): Promise<void> {
    const body = this.noteBody().trim();
    if (body.length < 3) return;
    const result = await this.noteAction.run(() => this.api.post<{ items: Note[] }>(`/admin/drivers/${this.id()}/notes`, { body }));
    if (!result) return;
    this.data.value.update((detail) => (detail ? { ...detail, notes: result.items } : detail));
    this.noteBody.set('');
    this.toast.success('Note ajoutée.');
  }

  protected async openRiskCase(summary: string, dialog: ActionDialogComponent): Promise<void> {
    const result = await this.action.run(() =>
      this.api.post<{ id: string }>('/admin/fraud/cases', { userId: this.id(), signalType: this.riskSignal(), summary }),
    );
    if (!result) return;
    dialog.close();
    this.toast.success('Dossier de risque ouvert.');
    void this.router.navigate(['/risque/dossiers', result.id]);
  }

  protected readonly feeSource = signal<'WALLET' | 'MANUAL'>('WALLET');

  protected async payMaintenanceFee(reason: string, dialog: ActionDialogComponent): Promise<void> {
    const d = this.data.value();
    if (!d?.maintenanceFee) return;
    const result = await this.action.run(() =>
      this.api.post(`/admin/members/${this.id()}/maintenance-fees/pay`, {
        month: d.maintenanceFee?.month,
        source: this.feeSource(),
        notes: reason || undefined,
      }),
    );
    if (!result) return;
    dialog.close();
    void this.data.load();
    this.toast.success(`Frais d’entretien (${d.maintenanceFee.month}) enregistrés avec succès.`);
  }
}
