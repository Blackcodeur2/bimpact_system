import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { Action, Loadable } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { formatBytes, fullName } from '../../core/format';
import {
  KYC_DECISION_LABELS,
  KYC_DOCUMENT_LABELS,
  KYC_ID_TYPES,
  KYC_REQUIREMENT_LABELS,
  RISK_FLAG_LABELS,
  SCAN_STATUS_LABELS,
  VEHICLE_OWNERSHIP,
} from '../../core/labels';
import { StaffDirectory } from '../../core/staff-directory.service';
import { ToastService } from '../../core/toast.service';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DictionaryLabelPipe, FrDatePipe, FrDateTimePipe, PhonePipe, RelativeTimePipe } from '../../shared/pipes';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

type Decision = 'APPROVED' | 'MORE_INFO_REQUESTED' | 'REJECTED';
type DocumentChoice = '' | 'ACCEPTED' | 'REJECTED';

interface KycDocument {
  id: string;
  type: string;
  status: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  rejectionReason: string | null;
  url: string;
  urlExpiresAt: string;
  active: boolean;
  scanStatus: string;
  sha256: string;
}

interface KycDossier {
  id: string;
  status: string;
  riskFlags: string[];
  provider: { name: string | null; reference: string | null };
  reviewerId: string | null;
  reviewStartedAt: string | null;
  account: {
    userId: string;
    phone: string;
    status: string;
    memberSince: string;
    firstName: string | null;
    lastName: string | null;
    city: string | null;
  };
  identity: {
    firstName: string | null;
    lastName: string | null;
    birthDate: string | null;
    idDocumentType: string | null;
    idDocumentNumber: string | null;
    idDocumentExpiry: string | null;
  };
  location: { city: string | null; district: string | null; addressHint: string | null };
  vehicle: { plate: string | null; model: string | null; ownership: string | null };
  requirements: { missing: string[] };
  submission: { count: number; submittedAt: string | null; reviewedAt: string | null; decisionReason: string | null };
  documents: KycDocument[];
  reviews: {
    id: string;
    reviewerId: string;
    decision: string;
    reason: string | null;
    internalNotes: string | null;
    submissionNumber: number;
    createdAt: string;
  }[];
}

const REVIEWABLE = ['SUBMITTED', 'UNDER_REVIEW'];

@Component({
  selector: 'bi-kyc-dossier-page',
  imports: [
    FormsModule,
    RouterLink,
    AsyncStateComponent,
    IconComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    DictionaryLabelPipe,
    FrDatePipe,
    FrDateTimePipe,
    PhonePipe,
    RelativeTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .docs {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 14px;
    }
    .doc {
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .doc-preview {
      height: 190px;
      background: var(--neutral-50);
      display: grid;
      place-items: center;
      border-bottom: 1px solid var(--border);
    }
    .doc-preview img {
      max-width: 100%;
      max-height: 190px;
      object-fit: contain;
      display: block;
    }
    .doc-file {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      font-weight: 600;
    }
    .doc-body {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .compare dt {
      font-size: 13px;
    }
  `,
  template: `
    <div class="page">
      <bi-page-header [title]="title()" subtitle="Consulter des pièces d'identité est une action sensible : chaque ouverture du dossier est journalisée." backLink="/kyc" backLabel="File de vérification">
        @if (data.value(); as d) {
          @if (canClaim()) {
            <button type="button" class="btn btn-secondary" [disabled]="claim.busy()" (click)="claimDossier()">
              @if (claim.busy()) {
                <span class="spinner"></span>
              }
              Prendre en charge
            </button>
          }
          @if (auth.can('admin.drivers.read')) {
            <a class="btn btn-ghost" [routerLink]="['/conducteurs', d.account.userId]"><bi-icon name="user" [size]="16" /> Fiche conducteur</a>
          }
        }
      </bi-page-header>

      <bi-async [loading]="data.loading()" [error]="data.error()" [hasContent]="!!data.value()" (retry)="data.load()">
        @if (data.value(); as d) {
          <div class="stack">
            @if (claim.error(); as err) {
              <div class="alert alert-danger" role="alert">{{ err }}</div>
            }
            @if (!isReviewable(d.status)) {
              <div class="alert">
                <bi-icon name="check" [size]="18" />
                <div>Ce dossier n’est pas en attente de vérification (statut : <bi-status domain="kyc" [code]="d.status" />).</div>
              </div>
            } @else if (claimedByOther()) {
              <div class="alert alert-warning">
                <bi-icon name="lock" [size]="18" />
                <div>Dossier pris en charge par {{ staff.name(d.reviewerId) }} {{ d.reviewStartedAt | ago }} : vous ne pouvez pas le décider.</div>
              </div>
            }
            @if (d.riskFlags.length > 0) {
              <div class="alert alert-warning">
                <bi-icon name="alert" [size]="18" />
                <div>
                  <strong>Alertes à vérifier :</strong>
                  @for (flag of d.riskFlags; track flag) {
                    <span> {{ flag | label: riskFlagLabels }}{{ $last ? '.' : ' ·' }}</span>
                  }
                </div>
              </div>
            }
            @if (d.requirements.missing.length > 0) {
              <div class="alert alert-danger">
                <bi-icon name="x" [size]="18" />
                <div>
                  <strong>Dossier incomplet :</strong>
                  @for (item of d.requirements.missing; track item) {
                    <span> {{ requirementLabel(item) }}{{ $last ? '.' : ' ·' }}</span>
                  }
                </div>
              </div>
            }

            <div class="grid grid-main-side">
              <div class="stack">
                <section class="card">
                  <div class="card-header">
                    <h3>Pièces du dossier</h3>
                    <span class="muted small">Liens valables jusqu’à {{ linksExpireAt() | frDateTime }}</span>
                  </div>
                  <div class="card-body">
                    <div class="docs">
                      @for (doc of activeDocuments(); track doc.id) {
                        <article class="doc">
                          <div class="doc-preview">
                            @if (isImage(doc)) {
                              <a [href]="fileUrl(doc)" target="_blank" rel="noopener"><img [src]="fileUrl(doc)" [alt]="doc.type | label: documentLabels" loading="lazy" /></a>
                            } @else {
                              <a class="doc-file" [href]="fileUrl(doc)" target="_blank" rel="noopener"><bi-icon name="file" [size]="28" /> Ouvrir le document</a>
                            }
                          </div>
                          <div class="doc-body">
                            <div class="row-nowrap">
                              <strong class="spacer">{{ doc.type | label: documentLabels }}</strong>
                              <bi-status domain="kycDocument" [code]="doc.status" />
                            </div>
                            <div class="small muted">{{ bytes(doc.sizeBytes) }} · {{ doc.uploadedAt | frDateTime }} · antivirus : {{ doc.scanStatus | label: scanLabels }}</div>
                            @if (doc.rejectionReason) {
                              <div class="small field-error">Motif précédent : {{ doc.rejectionReason }}</div>
                            }
                            @if (canDecide()) {
                              <select
                                class="input"
                                [name]="'doc-status-' + doc.id"
                                [attr.aria-label]="'Avis sur la pièce ' + (doc.type | label: documentLabels)"
                                [ngModel]="documentChoice(doc.id).status"
                                (ngModelChange)="setDocumentStatus(doc.id, $event)"
                              >
                                <option value="">Sans avis</option>
                                <option value="ACCEPTED">Accepter la pièce</option>
                                <option value="REJECTED">Refuser la pièce</option>
                              </select>
                              @if (documentChoice(doc.id).status === 'REJECTED') {
                                <input
                                  class="input"
                                  [name]="'doc-reason-' + doc.id"
                                  placeholder="Motif communiqué au membre"
                                  [ngModel]="documentChoice(doc.id).reason"
                                  (ngModelChange)="setDocumentReason(doc.id, $event)"
                                />
                              }
                            }
                          </div>
                        </article>
                      } @empty {
                        <p class="muted">Aucune pièce transmise.</p>
                      }
                    </div>
                  </div>
                </section>

                <section class="card">
                  <div class="card-header"><h3>Identité déclarée et compte</h3></div>
                  <div class="card-body grid grid-2">
                    <dl class="dl compare">
                      <dt>Prénom</dt>
                      <dd>{{ d.identity.firstName ?? '—' }}</dd>
                      <dt>Nom</dt>
                      <dd>{{ d.identity.lastName ?? '—' }}</dd>
                      <dt>Naissance</dt>
                      <dd>{{ d.identity.birthDate ?? '—' }}</dd>
                      <dt>Pièce</dt>
                      <dd>{{ d.identity.idDocumentType | label: idTypes }}</dd>
                      <dt>Numéro</dt>
                      <dd class="mono">{{ d.identity.idDocumentNumber ?? '—' }}</dd>
                      <dt>Expiration</dt>
                      <dd>{{ d.identity.idDocumentExpiry ?? '—' }}</dd>
                    </dl>
                    <dl class="dl compare">
                      <dt>Nom du compte</dt>
                      <dd>{{ accountName() }}</dd>
                      <dt>Téléphone</dt>
                      <dd>{{ d.account.phone | phone }}</dd>
                      <dt>Compte</dt>
                      <dd><bi-status domain="user" [code]="d.account.status" /></dd>
                      <dt>Membre depuis</dt>
                      <dd>{{ d.account.memberSince | frDate }}</dd>
                      <dt>Ville du compte</dt>
                      <dd>{{ d.account.city ?? '—' }}</dd>
                    </dl>
                  </div>
                </section>

                <section class="card">
                  <div class="card-header"><h3>Adresse et véhicule</h3></div>
                  <div class="card-body grid grid-2">
                    <dl class="dl">
                      <dt>Ville</dt>
                      <dd>{{ d.location.city ?? '—' }}</dd>
                      <dt>Quartier</dt>
                      <dd>{{ d.location.district ?? '—' }}</dd>
                      <dt>Repère</dt>
                      <dd>{{ d.location.addressHint ?? '—' }}</dd>
                    </dl>
                    <dl class="dl">
                      <dt>Immatriculation</dt>
                      <dd class="mono">{{ d.vehicle.plate ?? '—' }}</dd>
                      <dt>Modèle</dt>
                      <dd>{{ d.vehicle.model ?? '—' }}</dd>
                      <dt>Propriété</dt>
                      <dd>{{ d.vehicle.ownership | label: ownershipLabels }}</dd>
                    </dl>
                  </div>
                </section>
              </div>

              <div class="stack">
                @if (canDecide()) {
                  <section class="card">
                    <div class="card-header"><h3>Décision</h3></div>
                    <form class="card-body stack" (submit)="$event.preventDefault(); submitDecision()">
                      <div class="stack-sm" role="radiogroup" aria-label="Décision">
                        @for (choice of decisionChoices; track choice.value) {
                          <label class="checkbox">
                            <input type="radio" name="decision" [value]="choice.value" [checked]="decision() === choice.value" (change)="decision.set(choice.value)" />
                            {{ choice.label }}
                          </label>
                        }
                      </div>
                      <div class="field">
                        <label for="kyc-reason">Motif communiqué au membre{{ decision() === 'APPROVED' ? ' (facultatif)' : '' }}</label>
                        <textarea id="kyc-reason" name="reason" class="input" rows="3" [ngModel]="reason()" (ngModelChange)="reason.set($event)"></textarea>
                      </div>
                      <div class="field">
                        <label for="kyc-notes">Notes internes (jamais montrées au membre)</label>
                        <textarea id="kyc-notes" name="internalNotes" class="input" rows="2" [ngModel]="internalNotes()" (ngModelChange)="internalNotes.set($event)"></textarea>
                      </div>
                      @if (decisionIssue(); as issue) {
                        <p class="hint">{{ issue }}</p>
                      }
                      @if (decide.error(); as err) {
                        <div class="alert alert-danger" role="alert">{{ err }}</div>
                      }
                      <button
                        type="submit"
                        class="btn btn-block"
                        [class.btn-success]="decision() === 'APPROVED'"
                        [class.btn-danger]="decision() === 'REJECTED'"
                        [disabled]="decide.busy() || !!decisionIssue()"
                      >
                        @if (decide.busy()) {
                          <span class="spinner"></span>
                        }
                        Enregistrer la décision
                      </button>
                    </form>
                  </section>
                }

                <section class="card">
                  <div class="card-header"><h3>Soumission</h3></div>
                  <div class="card-body">
                    <dl class="dl">
                      <dt>Statut</dt>
                      <dd><bi-status domain="kyc" [code]="d.status" /></dd>
                      <dt>Soumission</dt>
                      <dd>n° {{ d.submission.count }}</dd>
                      <dt>Soumis le</dt>
                      <dd>{{ d.submission.submittedAt | frDateTime }}</dd>
                      <dt>Réviseur</dt>
                      <dd>{{ staff.name(d.reviewerId) }}</dd>
                      <dt>Dernière décision</dt>
                      <dd>{{ d.submission.reviewedAt | frDateTime }}</dd>
                      @if (d.submission.decisionReason) {
                        <dt>Dernier motif</dt>
                        <dd>{{ d.submission.decisionReason }}</dd>
                      }
                      <dt>Vérification</dt>
                      <dd>{{ d.provider.name ?? 'Revue manuelle' }}</dd>
                    </dl>
                  </div>
                </section>

                <section class="card">
                  <div class="card-header"><h3>Historique des décisions</h3></div>
                  <div class="card-body">
                    <ul class="timeline">
                      @for (review of d.reviews; track review.id) {
                        <li>
                          <div class="strong">{{ review.decision | label: decisionLabels }}</div>
                          <div class="small muted">Soumission n° {{ review.submissionNumber }} · {{ staff.name(review.reviewerId) }} · {{ review.createdAt | frDateTime }}</div>
                          @if (review.reason) {
                            <p class="small">{{ review.reason }}</p>
                          }
                          @if (review.internalNotes) {
                            <p class="small muted pre-line">Note interne : {{ review.internalNotes }}</p>
                          }
                        </li>
                      } @empty {
                        <p class="muted small">Aucune décision antérieure.</p>
                      }
                    </ul>
                  </div>
                </section>

                @if (replacedDocuments().length > 0) {
                  <section class="card">
                    <div class="card-header"><h3>Pièces remplacées</h3></div>
                    <div class="card-body stack-sm">
                      @for (doc of replacedDocuments(); track doc.id) {
                        <div class="row-nowrap">
                          <span class="spacer">{{ doc.type | label: documentLabels }} · {{ doc.uploadedAt | frDate }}</span>
                          <bi-status domain="kycDocument" [code]="doc.status" />
                          <a class="small" [href]="fileUrl(doc)" target="_blank" rel="noopener">Ouvrir</a>
                        </div>
                      }
                    </div>
                  </section>
                }
              </div>
            </div>
          </div>
        }
      </bi-async>
    </div>
  `,
})
export class KycDossierPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthStore);
  protected readonly staff = inject(StaffDirectory);

  readonly id = input.required<string>();

  protected readonly riskFlagLabels = RISK_FLAG_LABELS;
  protected readonly documentLabels = KYC_DOCUMENT_LABELS;
  protected readonly idTypes = KYC_ID_TYPES;
  protected readonly ownershipLabels = VEHICLE_OWNERSHIP;
  protected readonly scanLabels = SCAN_STATUS_LABELS;
  protected readonly decisionLabels = KYC_DECISION_LABELS;
  protected readonly decisionChoices: { value: Decision; label: string }[] = [
    { value: 'APPROVED', label: 'Approuver l’identité' },
    { value: 'MORE_INFO_REQUESTED', label: 'Demander un complément' },
    { value: 'REJECTED', label: 'Refuser le dossier' },
  ];

  protected readonly data = new Loadable(() => this.api.get<KycDossier>(`/admin/kyc/${this.id()}`));
  protected readonly claim = new Action();
  protected readonly decide = new Action();

  protected readonly decision = signal<Decision>('APPROVED');
  protected readonly reason = signal('');
  protected readonly internalNotes = signal('');
  private readonly documentChoices = signal<Record<string, { status: DocumentChoice; reason: string }>>({});

  protected readonly title = computed(() => {
    const d = this.data.value();
    if (!d) return 'Dossier d’identité';
    const name = fullName(d.identity);
    return `Dossier d’identité — ${name === '—' ? 'sans nom' : name}`;
  });
  protected readonly accountName = computed(() => fullName(this.data.value()?.account));
  protected readonly activeDocuments = computed(() => (this.data.value()?.documents ?? []).filter((doc) => doc.active));
  protected readonly replacedDocuments = computed(() => (this.data.value()?.documents ?? []).filter((doc) => !doc.active));
  protected readonly linksExpireAt = computed(() => this.activeDocuments()[0]?.urlExpiresAt ?? null);

  protected readonly claimedByOther = computed(() => {
    const d = this.data.value();
    const me = this.auth.user()?.id;
    return !!d && d.status === 'UNDER_REVIEW' && !!d.reviewerId && d.reviewerId !== me;
  });

  protected readonly canDecide = computed(() => {
    const d = this.data.value();
    return (
      !!d &&
      this.auth.can('admin.kyc.decide') &&
      REVIEWABLE.includes(d.status) &&
      !this.claimedByOther() &&
      d.account.userId !== this.auth.user()?.id
    );
  });

  protected readonly canClaim = computed(() => {
    const d = this.data.value();
    const alreadyMine = d?.status === 'UNDER_REVIEW' && d.reviewerId === this.auth.user()?.id;
    return this.canDecide() && !alreadyMine;
  });

  protected readonly decisionIssue = computed(() => {
    const d = this.data.value();
    if (!d) return null;
    const decision = this.decision();
    const choices = Object.values(this.documentChoices());
    if (decision !== 'APPROVED' && this.reason().trim().length < 5) return 'Indiquez au membre le motif de la décision (5 caractères minimum).';
    if (choices.some((choice) => choice.status === 'REJECTED' && choice.reason.trim().length < 3)) return 'Précisez le motif de chaque pièce refusée.';
    if (decision === 'APPROVED' && choices.some((choice) => choice.status === 'REJECTED')) return 'Un dossier ne peut pas être approuvé avec une pièce refusée.';
    if (decision === 'APPROVED' && d.requirements.missing.length > 0) return 'Le dossier est incomplet : il ne peut pas être approuvé.';
    return null;
  });

  constructor() {
    this.staff.ensureLoaded();
    effect(() => {
      this.id();
      untracked(() => {
        this.resetDecision();
        void this.data.load();
      });
    });
  }

  protected isReviewable(status: string): boolean {
    return REVIEWABLE.includes(status);
  }

  protected isImage(doc: KycDocument): boolean {
    return doc.mimeType.startsWith('image/');
  }

  protected fileUrl(doc: KycDocument): string {
    return this.api.fileUrl(doc.url);
  }

  protected bytes(size: number): string {
    return formatBytes(size);
  }

  protected requirementLabel(code: string): string {
    return KYC_REQUIREMENT_LABELS[code] ?? KYC_DOCUMENT_LABELS[code] ?? code;
  }

  protected documentChoice(id: string): { status: DocumentChoice; reason: string } {
    return this.documentChoices()[id] ?? { status: '', reason: '' };
  }

  protected setDocumentStatus(id: string, status: DocumentChoice): void {
    this.documentChoices.update((all) => {
      const next = { ...all };
      if (status) next[id] = { status, reason: all[id]?.reason ?? '' };
      else delete next[id];
      return next;
    });
  }

  protected setDocumentReason(id: string, reason: string): void {
    this.documentChoices.update((all) => {
      const current = all[id];
      return current ? { ...all, [id]: { ...current, reason } } : all;
    });
  }

  protected async claimDossier(): Promise<void> {
    const result = await this.claim.run(() => this.api.post(`/admin/kyc/${this.id()}/claim`));
    if (result === undefined) return;
    this.toast.success('Dossier pris en charge.');
    await this.data.load();
  }

  protected async submitDecision(): Promise<void> {
    if (this.decisionIssue()) return;
    const decision = this.decision();
    const reason = this.reason().trim();
    const internalNotes = this.internalNotes().trim();
    const documents = Object.entries(this.documentChoices()).map(([documentId, choice]) => ({
      documentId,
      status: choice.status,
      ...(choice.status === 'REJECTED' ? { reason: choice.reason.trim() } : {}),
    }));
    const body = {
      decision,
      ...(reason ? { reason } : {}),
      ...(internalNotes ? { internalNotes } : {}),
      ...(documents.length > 0 ? { documents } : {}),
    };
    const result = await this.decide.run(() => this.api.post(`/admin/kyc/${this.id()}/decision`, body));
    if (result === undefined) return;
    this.toast.success(`Décision enregistrée : ${KYC_DECISION_LABELS[decision] ?? decision}.`);
    this.resetDecision();
    await this.data.load();
  }

  private resetDecision(): void {
    this.decision.set('APPROVED');
    this.reason.set('');
    this.internalNotes.set('');
    this.documentChoices.set({});
    this.decide.reset();
    this.claim.reset();
  }
}
