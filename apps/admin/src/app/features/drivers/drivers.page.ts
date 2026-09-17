import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Money, Page } from '../../core/api/api.service';
import { ApiService } from '../../core/api/api.service';
import { PagedList } from '../../core/api/loaders';
import { downloadCsv, toCsv } from '../../core/csv';
import { dayKey } from '../../core/format';
import { statusLabel, statusOptions } from '../../core/labels';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { LoadMoreComponent } from '../../shared/load-more.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { FrDatePipe, MoneyPipe, PhonePipe, RelativeTimePipe } from '../../shared/pipes';
import { BadgeComponent, StatusBadgeComponent } from '../../shared/status-badge.component';

interface DriverRow {
  id: string;
  name: string | null;
  phone: string;
  city: string | null;
  zone: string | null;
  status: string;
  kycStatus: string;
  balance: Money | null;
  paidDaysLast30: number;
  openRiskCases: number;
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

@Component({
  selector: 'bi-drivers-page',
  imports: [
    FormsModule,
    RouterLink,
    AsyncStateComponent,
    IconComponent,
    LoadMoreComponent,
    PageHeaderComponent,
    StatusBadgeComponent,
    BadgeComponent,
    FrDatePipe,
    MoneyPipe,
    PhonePipe,
    RelativeTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header
        title="Conducteurs"
        subtitle="Membres de l'application : recherche, statut du compte, vérification d'identité et régularité des contributions."
      >
        <button type="button" class="btn btn-secondary" [disabled]="list.items().length === 0" (click)="exportCsv()">
          <bi-icon name="download" [size]="16" /> Exporter les lignes affichées
        </button>
      </bi-page-header>

      <section class="card">
        <form class="card-body filters" (submit)="$event.preventDefault(); list.reload()">
          <div class="field">
            <label for="drivers-q">Recherche</label>
            <input id="drivers-q" name="q" class="input" placeholder="Nom, prénom ou téléphone" [ngModel]="q()" (ngModelChange)="q.set($event)" />
          </div>
          <div class="field">
            <label for="drivers-status">Compte</label>
            <select id="drivers-status" name="status" class="input" [ngModel]="status()" (ngModelChange)="status.set($event); list.reload()">
              <option value="">Tous les statuts</option>
              @for (option of statusChoices; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="drivers-kyc">Identité</label>
            <select id="drivers-kyc" name="kycStatus" class="input" [ngModel]="kycStatus()" (ngModelChange)="kycStatus.set($event); list.reload()">
              <option value="">Toutes</option>
              @for (option of kycChoices; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="drivers-city">Ville</label>
            <input id="drivers-city" name="city" class="input" placeholder="Ex. Douala" [ngModel]="city()" (ngModelChange)="city.set($event)" />
          </div>
          <button type="submit" class="btn btn-secondary"><bi-icon name="search" [size]="16" /> Rechercher</button>
        </form>

        <bi-async
          [loading]="list.loading()"
          [error]="list.loaded() ? null : list.error()"
          [empty]="list.loaded() && list.items().length === 0"
          [hasContent]="list.items().length > 0"
          emptyTitle="Aucun conducteur"
          emptyText="Aucun membre ne correspond à ces critères."
          (retry)="list.reload()"
        >
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Conducteur</th>
                  <th>Ville</th>
                  <th>Compte</th>
                  <th>Identité</th>
                  <th class="num">Solde</th>
                  <th class="num">Contributions 30 j</th>
                  <th>Risque</th>
                  <th>Inscription</th>
                </tr>
              </thead>
              <tbody>
                @for (row of list.items(); track row.id) {
                  <tr class="clickable" (click)="open(row.id)">
                    <td>
                      <a class="cell-title" [routerLink]="['/conducteurs', row.id]" (click)="$event.stopPropagation()">{{ row.name ?? 'Nom non renseigné' }}</a>
                      <div class="cell-sub">{{ row.phone | phone }}</div>
                    </td>
                    <td>
                      {{ row.city ?? '—' }}
                      @if (row.zone) {
                        <div class="cell-sub">{{ row.zone }}</div>
                      }
                    </td>
                    <td>
                      <div class="row" style="gap: 6px">
                        <bi-status domain="user" [code]="row.status" />
                        @if (row.locked) {
                          <bi-badge tone="warning">Verrouillé</bi-badge>
                        }
                      </div>
                    </td>
                    <td><bi-status domain="kyc" [code]="row.kycStatus" /></td>
                    <td class="num nowrap">{{ row.balance | xaf }}</td>
                    <td class="num">{{ row.paidDaysLast30 }} / 30</td>
                    <td>
                      @if (row.openRiskCases > 0) {
                        <bi-badge tone="danger">{{ row.openRiskCases }} ouvert(s)</bi-badge>
                      } @else {
                        <span class="muted">—</span>
                      }
                    </td>
                    <td class="nowrap">
                      {{ row.createdAt | frDate }}
                      <div class="cell-sub">Connexion {{ row.lastLoginAt | ago }}</div>
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
export class DriversPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly statusChoices = statusOptions('user');
  protected readonly kycChoices = statusOptions('kyc');
  protected readonly q = signal('');
  protected readonly status = signal('');
  protected readonly kycStatus = signal('');
  protected readonly city = signal('');

  protected readonly list = new PagedList<DriverRow>((cursor) =>
    this.api.get<Page<DriverRow>>('/admin/drivers', {
      q: this.q().trim(),
      status: this.status(),
      kycStatus: this.kycStatus(),
      city: this.city().trim(),
      cursor,
      limit: 25,
    }),
  );

  ngOnInit(): void {
    void this.list.reload();
  }

  protected open(id: string): void {
    void this.router.navigate(['/conducteurs', id]);
  }

  protected exportCsv(): void {
    const csv = toCsv<DriverRow>(
      [
        { label: 'Nom', value: (row) => row.name },
        { label: 'Téléphone', value: (row) => row.phone },
        { label: 'Ville', value: (row) => row.city },
        { label: 'Zone', value: (row) => row.zone },
        { label: 'Compte', value: (row) => statusLabel('user', row.status).label },
        { label: 'Identité', value: (row) => statusLabel('kyc', row.kycStatus).label },
        { label: 'Solde disponible (FCFA)', value: (row) => row.balance?.amount },
        { label: 'Contributions sur 30 jours', value: (row) => row.paidDaysLast30 },
        { label: 'Dossiers de risque ouverts', value: (row) => row.openRiskCases },
        { label: 'Inscription', value: (row) => row.createdAt },
        { label: 'Dernière connexion', value: (row) => row.lastLoginAt },
      ],
      this.list.items(),
    );
    downloadCsv(`conducteurs-${dayKey()}.csv`, csv);
  }
}
