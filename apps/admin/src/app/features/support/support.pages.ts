import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { Action, Loadable, PagedList } from '../../core/api/loaders';
import { AuthStore } from '../../core/auth/auth.store';
import { statusOptions, SUPPORT_CATEGORIES } from '../../core/labels';
import { ToastService } from '../../core/toast.service';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DictionaryLabelPipe, FrDateTimePipe, FullNamePipe, PhonePipe, RelativeTimePipe } from '../../shared/pipes';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

interface TicketMember {
  userId: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  city?: string | null;
}

interface TicketRow {
  id: string;
  reference: string;
  category: string;
  subject: string;
  status: string;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  member: TicketMember;
}

interface TicketDetail extends TicketRow {
  canReply: boolean;
  messages: { id: string; authorType: 'MEMBER' | 'STAFF'; body: string; createdAt: string }[];
}

@Component({
  selector: 'bi-support-tickets-page',
  imports: [
    FormsModule,
    RouterLink,
    AsyncStateComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    DictionaryLabelPipe,
    FrDateTimePipe,
    FullNamePipe,
    PhonePipe,
    RelativeTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header title="Support" subtitle="Demandes des membres. Chaque réponse notifie le membre ; le contenu des échanges n'est pas recopié dans le journal d'audit." />

      <section class="card">
        <div class="card-body filters">
          <div class="field">
            <label for="tickets-status">Statut</label>
            <select id="tickets-status" name="status" class="input" [ngModel]="status()" (ngModelChange)="status.set($event); list.reload()">
              <option value="">Toutes les demandes</option>
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
          emptyTitle="Aucune demande"
          emptyText="Aucune demande de support ne correspond à ce filtre."
          (retry)="list.reload()"
        >
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Sujet</th>
                  <th>Membre</th>
                  <th>Statut</th>
                  <th>Dernier message</th>
                  <th>Créée</th>
                </tr>
              </thead>
              <tbody>
                @for (row of list.items(); track row.id) {
                  <tr class="clickable" (click)="open(row.id)">
                    <td class="nowrap">
                      <a class="mono" [routerLink]="['/support', row.id]" (click)="$event.stopPropagation()">{{ row.reference }}</a>
                    </td>
                    <td>
                      <div class="cell-title">{{ row.subject }}</div>
                      <div class="cell-sub">{{ row.category | label: categoryLabels }}</div>
                    </td>
                    <td>
                      {{ row.member | fullName }}
                      <div class="cell-sub">{{ row.member.phone | phone }}</div>
                    </td>
                    <td><bi-status domain="ticket" [code]="row.status" /></td>
                    <td class="nowrap">{{ row.lastMessageAt | ago }}</td>
                    <td class="nowrap">{{ row.createdAt | frDateTime }}</td>
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
export class SupportTicketsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly categoryLabels = SUPPORT_CATEGORIES;
  protected readonly statusChoices = statusOptions('ticket');
  protected readonly status = signal('OPEN');
  protected readonly list = new PagedList<TicketRow>((cursor) =>
    this.api.get<Page<TicketRow>>('/admin/support/tickets', { status: this.status(), cursor, limit: 25 }),
  );

  ngOnInit(): void {
    void this.list.reload();
  }

  protected open(id: string): void {
    void this.router.navigate(['/support', id]);
  }
}

@Component({
  selector: 'bi-support-ticket-page',
  imports: [
    FormsModule,
    RouterLink,
    AsyncStateComponent,
    IconComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    DictionaryLabelPipe,
    FrDateTimePipe,
    FullNamePipe,
    PhonePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .thread {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .msg {
      max-width: 78%;
      padding: 10px 14px;
      border-radius: 14px;
      background: var(--neutral-100);
      align-self: flex-start;
    }
    .msg.staff {
      align-self: flex-end;
      background: var(--primary-50);
    }
    .msg-meta {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
  `,
  template: `
    <div class="page">
      <bi-page-header [title]="title()" [subtitle]="subtitle()" backLink="/support" backLabel="Support">
        @if (data.value(); as d) {
          @if (d.status !== 'RESOLVED' && d.status !== 'CLOSED') {
            <button type="button" class="btn btn-success" [disabled]="statusAction.busy()" (click)="setStatus('RESOLVED')">
              <bi-icon name="check" [size]="16" /> Marquer résolue
            </button>
          }
          @if (d.status === 'RESOLVED' || d.status === 'CLOSED') {
            <button type="button" class="btn btn-secondary" [disabled]="statusAction.busy()" (click)="setStatus('OPEN')">Rouvrir</button>
          }
          @if (d.status !== 'CLOSED') {
            <button type="button" class="btn btn-secondary" [disabled]="statusAction.busy()" (click)="setStatus('CLOSED')">Clôturer</button>
          }
        }
      </bi-page-header>

      <bi-async [loading]="data.loading()" [error]="data.error()" [hasContent]="!!data.value()" (retry)="data.load()">
        @if (data.value(); as d) {
          <div class="grid grid-main-side">
            <section class="card">
              <div class="card-header">
                <h3>Échanges</h3>
                <bi-status domain="ticket" [code]="d.status" />
              </div>
              <div class="card-body stack">
                @if (statusAction.error(); as err) {
                  <div class="alert alert-danger" role="alert">{{ err }}</div>
                }
                <div class="thread">
                  @for (message of d.messages; track message.id) {
                    <div class="msg" [class.staff]="message.authorType === 'STAFF'">
                      <div class="msg-meta">{{ message.authorType === 'STAFF' ? 'Équipe BENSKIN IMPACT' : 'Membre' }} · {{ message.createdAt | frDateTime }}</div>
                      <p class="pre-line break">{{ message.body }}</p>
                    </div>
                  }
                </div>
                @if (d.canReply) {
                  <form class="stack-sm" (submit)="$event.preventDefault(); reply()">
                    <label for="ticket-reply" class="strong">Répondre au membre</label>
                    <textarea id="ticket-reply" name="reply" class="input" rows="4" [ngModel]="replyBody()" (ngModelChange)="replyBody.set($event)"></textarea>
                    @if (replyAction.error(); as err) {
                      <span class="field-error">{{ err }}</span>
                    }
                    <div class="row">
                      <span class="hint spacer">Le membre est notifié ; la demande passe en « Attente du membre ».</span>
                      <button type="submit" class="btn" [disabled]="replyAction.busy() || replyBody().trim().length < 2">
                        @if (replyAction.busy()) {
                          <span class="spinner"></span>
                        } @else {
                          <bi-icon name="send" [size]="16" />
                        }
                        Envoyer
                      </button>
                    </div>
                  </form>
                } @else {
                  <p class="muted small">Demande clôturée : rouvrez-la pour répondre.</p>
                }
              </div>
            </section>

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
                  <dt>Catégorie</dt>
                  <dd>{{ d.category | label: categoryLabels }}</dd>
                  <dt>Créée le</dt>
                  <dd>{{ d.createdAt | frDateTime }}</dd>
                  <dt>Dernier message</dt>
                  <dd>{{ d.lastMessageAt | frDateTime }}</dd>
                </dl>
              </div>
            </section>
          </div>
        }
      </bi-async>
    </div>
  `,
})
export class SupportTicketPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthStore);

  readonly id = input.required<string>();

  protected readonly categoryLabels = SUPPORT_CATEGORIES;
  protected readonly data = new Loadable(() => this.api.get<TicketDetail>(`/admin/support/tickets/${this.id()}`));
  protected readonly replyAction = new Action();
  protected readonly statusAction = new Action();
  protected readonly replyBody = signal('');

  protected readonly title = computed(() => this.data.value()?.subject ?? 'Demande de support');
  protected readonly subtitle = computed(() => {
    const d = this.data.value();
    return d ? `Référence ${d.reference}` : '';
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.data.load());
    });
  }

  protected async reply(): Promise<void> {
    const body = this.replyBody().trim();
    if (body.length < 2) return;
    const result = await this.replyAction.run(() => this.api.post<TicketDetail>(`/admin/support/tickets/${this.id()}/messages`, { body }));
    if (!result) return;
    this.data.set(result);
    this.replyBody.set('');
    this.toast.success('Réponse envoyée au membre.');
  }

  protected async setStatus(status: 'OPEN' | 'RESOLVED' | 'CLOSED'): Promise<void> {
    const result = await this.statusAction.run(() => this.api.post<TicketDetail>(`/admin/support/tickets/${this.id()}/status`, { status }));
    if (!result) return;
    this.data.set(result);
    this.toast.success(status === 'RESOLVED' ? 'Demande marquée résolue : le membre est notifié.' : status === 'CLOSED' ? 'Demande clôturée.' : 'Demande rouverte.');
  }
}
