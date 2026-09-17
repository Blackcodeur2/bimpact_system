import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Money, Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Action, Loadable, PagedList } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { formatMoney } from '../../core/format';
import { ACCIDENT_DOCUMENT_LABELS, ACTOR_TYPE_LABELS, statusOptions } from '../../core/labels';
import { StaffDirectory } from '../../core/staff-directory.service';
import { ToastService } from '../../core/toast.service';
import { ActionDialogComponent } from '../../shared/action-dialog.component';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { DocumentListComponent, StoredDocument } from '../../shared/document-list.component';
import { IconComponent } from '../../shared/icon.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DictionaryLabelPipe, FrDatePipe, FrDateTimePipe, FullNamePipe, MoneyPipe, PhonePipe } from '../../shared/pipes';
import { BadgeComponent, StatusBadgeComponent } from '../../shared/status-badge.component';

interface SolidarityOverview {
  rules: { collectionsEnabled: boolean; contributionPerClaim: Money; maxAssistance: Money; waitingDays: number; rulesVersion: string };
  fund: { balance: Money; activeMembers: number };
}

interface ClaimMember {
  userId: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
}

interface ClaimRow {
  id: string;
  reference: string;
  date: string;
  location: string;
  severity: string;
  status: string;
  requestedAmount: Money;
  approvedAmount: Money | null;
  disbursedAmount: Money | null;
  createdAt: string;
  updatedAt: string;
  documentsCount: number;
  solidarityEligible: boolean;
  member: ClaimMember;
}

interface ClaimDetail extends Omit<ClaimRow, 'documentsCount' | 'member'> {
  thirdPartyInvolved: boolean;
  hospitalName: string | null;
  description: string;
  decisionReason: string | null;
  canAddDocuments: boolean;
  documents: StoredDocument[];
  timeline: { id: string; type: string; status: string | null; message: string | null; actorType: string; createdAt: string }[];
  internalNotes: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  member: ClaimMember & {
    kycStatus: string | null;
    solidarityMembership: { status: string; joinedAt: string; leftAt: string | null } | null;
  };
}

@Component({
  selector: 'bi-accidents-page',
  imports: [
    FormsModule,
    RouterLink,
    AsyncStateComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    BadgeComponent,
    FrDatePipe,
    FullNamePipe,
    MoneyPipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header
        title="Accidents & solidarité"
        subtitle="Déclarations d'accident examinées par le comité. Une aide n'est versée par le fonds de solidarité volontaire que si le membre y était couvert et que les collectes sont activées."
      />

      <div class="stack">
        <bi-async [loading]="overview.loading()" [error]="overview.error()" [hasContent]="!!overview.value()" (retry)="overview.load()">
          @if (overview.value(); as o) {
            <div class="grid grid-4">
              <div class="card kpi">
                <span class="kpi-label">Fonds de solidarité</span>
                <span class="kpi-value">{{ o.fund.balance | xaf }}</span>
                <span class="kpi-sub">{{ o.fund.activeMembers }} adhérent(s) actif(s)</span>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Collectes</span>
                <span class="kpi-value" style="font-size: 18px">
                  @if (o.rules.collectionsEnabled) {
                    <bi-badge tone="success">Activées</bi-badge>
                  } @else {
                    <bi-badge tone="warning">Désactivées</bi-badge>
                  }
                </span>
                <span class="kpi-sub">Règlement {{ o.rules.rulesVersion }}</span>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Participation par dossier</span>
                <span class="kpi-value">{{ o.rules.contributionPerClaim | xaf }}</span>
                <span class="kpi-sub">Carence de {{ o.rules.waitingDays }} jour(s)</span>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Plafond d’aide</span>
                <span class="kpi-value">{{ o.rules.maxAssistance | xaf }}</span>
                <span class="kpi-sub">par dossier, dans la limite du fonds</span>
              </div>
            </div>
          }
        </bi-async>

        <section class="card">
          <div class="card-body filters">
            <div class="field">
              <label for="claims-status">Statut</label>
              <select id="claims-status" name="status" class="input" [ngModel]="status()" (ngModelChange)="status.set($event); list.reload()">
                <option value="">Tous les dossiers</option>
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
            emptyTitle="Aucun dossier"
            emptyText="Aucune déclaration d'accident ne correspond à ce filtre."
            (retry)="list.reload()"
          >
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Dossier</th>
                    <th>Membre</th>
                    <th>Accident</th>
                    <th>Gravité</th>
                    <th class="num">Demandé</th>
                    <th class="num">Accordé / versé</th>
                    <th class="num">Pièces</th>
                    <th>Solidarité</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of list.items(); track row.id) {
                    <tr class="clickable" (click)="open(row.id)">
                      <td class="nowrap">
                        <a class="mono" [routerLink]="['/accidents', row.id]" (click)="$event.stopPropagation()">{{ row.reference }}</a>
                        <div class="cell-sub">déclaré le {{ row.createdAt | frDate }}</div>
                      </td>
                      <td>
                        {{ row.member | fullName }}
                        <div class="cell-sub">{{ row.member.phone | phone }}</div>
                      </td>
                      <td>
                        {{ row.date | frDate }}
                        <div class="cell-sub">{{ row.location }}</div>
                      </td>
                      <td><bi-status domain="severity" [code]="row.severity" /></td>
                      <td class="num nowrap">{{ row.requestedAmount | xaf }}</td>
                      <td class="num nowrap">
                        {{ row.approvedAmount | xaf }}
                        @if (row.disbursedAmount) {
                          <div class="cell-sub">versé {{ row.disbursedAmount | xaf }}</div>
                        }
                      </td>
                      <td class="num">{{ row.documentsCount }}</td>
                      <td>
                        @if (row.solidarityEligible) {
                          <bi-badge tone="success">Couvert</bi-badge>
                        } @else {
                          <bi-badge>Non couvert</bi-badge>
                        }
                      </td>
                      <td><bi-status domain="accident" [code]="row.status" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <bi-load-more [list]="list" />
          </bi-async>
        </section>
      </div>
    </div>
  `,
})
export class AccidentsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly statusChoices = statusOptions('accident');
  protected readonly status = signal('');
  protected readonly overview = new Loadable(() => this.api.get<SolidarityOverview>('/admin/solidarity'));
  protected readonly list = new PagedList<ClaimRow>((cursor) =>
    this.api.get<Page<ClaimRow>>('/admin/accidents', { status: this.status(), cursor, limit: 25 }),
  );

  ngOnInit(): void {
    void this.overview.load();
    void this.list.reload();
  }

  protected open(id: string): void {
    void this.router.navigate(['/accidents', id]);
  }
}

@Component({
  selector: 'bi-accident-detail-page',
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
    DictionaryLabelPipe,
    FrDatePipe,
    FrDateTimePipe,
    FullNamePipe,
    MoneyPipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header [title]="pageTitle()" subtitle="Une déclaration ne vaut jamais accord. Chaque décision est motivée, tracée et notifiée au membre." backLink="/accidents" backLabel="Accidents & solidarité">
        @if (data.value(); as d) {
          @if (auth.can('admin.accidents.decide')) {
            @if (d.status === 'SUBMITTED' || d.status === 'DOCUMENTS_PENDING') {
              <button type="button" class="btn btn-secondary" (click)="openWithNote(investigateDialog)">Ouvrir l’instruction</button>
            }
            @if (d.status === 'SUBMITTED' || d.status === 'INVESTIGATING') {
              <button type="button" class="btn btn-secondary" (click)="action.reset(); documentsDialog.open()">Demander des pièces</button>
              <button type="button" class="btn btn-success" (click)="openApprove(d, approveDialog)"><bi-icon name="check" [size]="16" /> Accorder une aide</button>
            }
            @if (d.status === 'APPROVED' && d.solidarityEligible) {
              <button type="button" class="btn" (click)="action.reset(); disburseDialog.open()"><bi-icon name="coins" [size]="16" /> Verser l’aide</button>
            }
            @if (d.status === 'SUBMITTED' || d.status === 'DOCUMENTS_PENDING' || d.status === 'INVESTIGATING') {
              <button type="button" class="btn btn-danger" (click)="action.reset(); rejectDialog.open()"><bi-icon name="x" [size]="16" /> Refuser</button>
            }
            @if (d.status === 'APPROVED' || d.status === 'DISBURSED' || d.status === 'REJECTED') {
              <button type="button" class="btn btn-secondary" (click)="openWithNote(closeDialog)">Clôturer</button>
            }
          }
        }
      </bi-page-header>

      <bi-async [loading]="data.loading()" [error]="data.error()" [hasContent]="!!data.value()" (retry)="data.load()">
        @if (data.value(); as d) {
          <div class="grid grid-main-side">
            <div class="stack">
              <section class="card">
                <div class="card-header">
                  <h3>Déclaration</h3>
                  <bi-status domain="accident" [code]="d.status" />
                </div>
                <div class="card-body stack">
                  <dl class="dl">
                    <dt>Date de l’accident</dt>
                    <dd>{{ d.date | frDateTime }}</dd>
                    <dt>Lieu</dt>
                    <dd>{{ d.location }}</dd>
                    <dt>Gravité</dt>
                    <dd><bi-status domain="severity" [code]="d.severity" /></dd>
                    <dt>Tiers impliqué</dt>
                    <dd>{{ d.thirdPartyInvolved ? 'Oui' : 'Non' }}</dd>
                    <dt>Établissement de soins</dt>
                    <dd>{{ d.hospitalName ?? '—' }}</dd>
                    <dt>Montant demandé</dt>
                    <dd>{{ d.requestedAmount | xaf }}</dd>
                    <dt>Montant accordé</dt>
                    <dd>{{ d.approvedAmount | xaf }}</dd>
                    <dt>Montant versé</dt>
                    <dd>{{ d.disbursedAmount | xaf }}</dd>
                    <dt>Fonds de solidarité</dt>
                    <dd>
                      @if (d.solidarityEligible) {
                        <bi-badge tone="success">Couvert à la date de l’accident</bi-badge>
                      } @else {
                        <bi-badge>Non couvert : aucun versement solidaire possible</bi-badge>
                      }
                    </dd>
                  </dl>
                  <div>
                    <div class="eyebrow">Récit du membre</div>
                    <p class="pre-line break">{{ d.description }}</p>
                  </div>
                  @if (d.decisionReason) {
                    <div class="alert">
                      <div><strong>Motif communiqué :</strong> {{ d.decisionReason }}</div>
                    </div>
                  }
                </div>
              </section>

              <section class="card">
                <div class="card-header"><h3>Justificatifs</h3></div>
                <div class="card-body"><bi-document-list [documents]="d.documents" [labels]="documentLabels" /></div>
              </section>

              <section class="card">
                <div class="card-header"><h3>Chronologie</h3></div>
                <div class="card-body">
                  <ul class="timeline">
                    @for (event of d.timeline; track event.id) {
                      <li>
                        <div class="row" style="gap: 8px">
                          <strong>{{ event.actorType | label: actorLabels }}</strong>
                          @if (event.status) {
                            <bi-status domain="accident" [code]="event.status" />
                          }
                          <span class="small muted">{{ event.createdAt | frDateTime }}</span>
                        </div>
                        @if (event.message) {
                          <p class="small pre-line">{{ event.message }}</p>
                        }
                      </li>
                    }
                  </ul>
                </div>
              </section>
            </div>

            <div class="stack">
              <section class="card">
                <div class="card-header"><h3>Membre</h3></div>
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
                    <dt>Solidarité</dt>
                    <dd>
                      @if (d.member.solidarityMembership; as membership) {
                        <bi-status domain="solidarity" [code]="membership.status" /> depuis le {{ membership.joinedAt | frDate }}
                      } @else {
                        Non adhérent
                      }
                    </dd>
                  </dl>
                </div>
              </section>

              <section class="card">
                <div class="card-header"><h3>Instruction</h3></div>
                <div class="card-body stack-sm">
                  <dl class="dl">
                    <dt>Décidé par</dt>
                    <dd>{{ staff.name(d.decidedById) }}</dd>
                    <dt>Décidé le</dt>
                    <dd>{{ d.decidedAt | frDateTime }}</dd>
                  </dl>
                  <div class="eyebrow">Notes internes</div>
                  <p class="small pre-line break">{{ d.internalNotes ?? 'Aucune note interne.' }}</p>
                </div>
              </section>
            </div>
          </div>
        }
      </bi-async>

      <bi-action-dialog
        #investigateDialog
        title="Ouvrir l'instruction"
        message="Le membre est informé que son dossier est examiné."
        confirmLabel="Ouvrir l'instruction"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="investigate(investigateDialog)"
      >
        <div class="field">
          <label for="claim-investigate-note">Note interne (facultatif, jamais montrée au membre)</label>
          <textarea id="claim-investigate-note" name="investigateNote" class="input" rows="3" maxlength="1000" [ngModel]="note()" (ngModelChange)="note.set($event)"></textarea>
        </div>
      </bi-action-dialog>

      <bi-action-dialog
        #documentsDialog
        title="Demander des pièces"
        message="Le dossier passe en attente de justificatifs ; il repart en examen dès que le membre ajoute une pièce."
        confirmLabel="Envoyer la demande"
        reasonLabel="Pièces attendues (message au membre)"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="requestDocuments($event, documentsDialog)"
      />

      <bi-action-dialog
        #approveDialog
        title="Accorder une aide"
        [message]="approveMessage()"
        confirmLabel="Accorder l'aide"
        tone="success"
        reasonLabel="Motif communiqué au membre"
        [valid]="amountValid()"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="approve($event, approveDialog)"
      >
        <div class="field">
          <label for="claim-amount">Montant accordé (FCFA)</label>
          <input id="claim-amount" name="approvedAmount" class="input" inputmode="numeric" [ngModel]="amount()" (ngModelChange)="amount.set($event)" />
          <span class="hint">Montant entier, au plus égal au montant demandé et au plafond d’aide.</span>
        </div>
        <div class="field">
          <label for="claim-approve-note">Note interne (facultatif)</label>
          <textarea id="claim-approve-note" name="approveNote" class="input" rows="2" maxlength="1000" [ngModel]="note()" (ngModelChange)="note.set($event)"></textarea>
        </div>
      </bi-action-dialog>

      <bi-action-dialog
        #disburseDialog
        title="Verser l'aide"
        message="Les participations sont prélevées auprès des adhérents disposant d'un solde suffisant, puis l'aide est versée sur le portefeuille du membre dans la limite du fonds. L'opération peut être relancée sans double versement."
        confirmLabel="Verser"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="disburse(disburseDialog)"
      />

      <bi-action-dialog
        #rejectDialog
        title="Refuser le dossier"
        message="Le membre est notifié avec votre motif."
        confirmLabel="Refuser"
        tone="danger"
        reasonLabel="Motif communiqué au membre"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="reject($event, rejectDialog)"
      />

      <bi-action-dialog
        #closeDialog
        title="Clôturer le dossier"
        message="Le dossier est archivé ; il ne peut plus être modifié."
        confirmLabel="Clôturer"
        [busy]="action.busy()"
        [error]="action.error()"
        (confirmed)="close(closeDialog)"
      >
        <div class="field">
          <label for="claim-close-reason">Message de clôture (facultatif)</label>
          <textarea id="claim-close-reason" name="closeReason" class="input" rows="2" maxlength="500" [ngModel]="note()" (ngModelChange)="note.set($event)"></textarea>
        </div>
      </bi-action-dialog>
    </div>
  `,
})
export class AccidentDetailPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthStore);
  protected readonly staff = inject(StaffDirectory);

  readonly id = input.required<string>();

  protected readonly documentLabels = ACCIDENT_DOCUMENT_LABELS;
  protected readonly actorLabels = ACTOR_TYPE_LABELS;
  protected readonly data = new Loadable(() => this.api.get<ClaimDetail>(`/admin/accidents/${this.id()}`));
  protected readonly overview = new Loadable(() => this.api.get<SolidarityOverview>('/admin/solidarity'));
  protected readonly action = new Action();
  protected readonly note = signal('');
  protected readonly amount = signal('');

  protected readonly pageTitle = computed(() => {
    const d = this.data.value();
    return d ? `Dossier ${d.reference}` : 'Dossier accident';
  });
  protected readonly amountValid = computed(() => /^[1-9]\d{0,8}$/.test(this.amount().trim()));
  protected readonly approveMessage = computed(() => {
    const d = this.data.value();
    const cap = this.overview.value()?.rules.maxAssistance;
    const parts = [`Montant demandé : ${d ? formatMoney(d.requestedAmount) : '—'}`];
    if (cap) parts.push(`plafond d’aide : ${formatMoney(cap)}`);
    const eligible = d?.solidarityEligible ? ' Si les collectes sont activées, le versement est lancé immédiatement.' : ' Le membre n’étant pas couvert, aucun versement solidaire ne sera effectué.';
    return `${parts.join(' · ')}.${eligible}`;
  });

  constructor() {
    this.staff.ensureLoaded();
    effect(() => {
      this.id();
      untracked(() => void this.data.load());
    });
  }

  protected openWithNote(dialog: ActionDialogComponent): void {
    this.action.reset();
    this.note.set('');
    dialog.open();
  }

  protected openApprove(d: ClaimDetail, dialog: ActionDialogComponent): void {
    this.action.reset();
    this.note.set('');
    this.amount.set(d.requestedAmount.amount.split('.')[0] ?? '');
    if (!this.overview.value()) void this.overview.load();
    dialog.open();
  }

  protected investigate(dialog: ActionDialogComponent): Promise<void> {
    const internalNote = this.note().trim();
    return this.submit('investigate', internalNote ? { internalNote } : {}, dialog, 'Instruction ouverte : le membre est informé.');
  }

  protected requestDocuments(reason: string, dialog: ActionDialogComponent): Promise<void> {
    return this.submit('request-documents', { reason }, dialog, 'Demande de pièces envoyée au membre.');
  }

  protected approve(reason: string, dialog: ActionDialogComponent): Promise<void> {
    const internalNote = this.note().trim();
    return this.submit(
      'approve',
      { approvedAmount: this.amount().trim(), reason, ...(internalNote ? { internalNote } : {}) },
      dialog,
      'Aide accordée : le membre est notifié.',
    );
  }

  protected disburse(dialog: ActionDialogComponent): Promise<void> {
    return this.submit('disburse', {}, dialog, 'Versement traité : consultez la chronologie pour le montant versé.');
  }

  protected reject(reason: string, dialog: ActionDialogComponent): Promise<void> {
    return this.submit('reject', { reason }, dialog, 'Dossier refusé : le membre est notifié.');
  }

  protected close(dialog: ActionDialogComponent): Promise<void> {
    const reason = this.note().trim();
    return this.submit('close', reason ? { reason } : {}, dialog, 'Dossier clôturé.');
  }

  private async submit(step: string, body: object, dialog: ActionDialogComponent, message: string): Promise<void> {
    const result = await this.action.run(() => this.api.post<ClaimDetail>(`/admin/accidents/${this.id()}/${step}`, body));
    if (!result) return;
    this.data.set(result);
    dialog.close();
    this.toast.success(message);
  }
}
