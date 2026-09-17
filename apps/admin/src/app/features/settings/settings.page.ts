import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { Action, Loadable } from '../../core/api/loaders';
import { formatAmount } from '../../core/format';
import { StaffDirectory } from '../../core/staff-directory.service';
import { ToastService } from '../../core/toast.service';
import { ActionDialogComponent } from '../../shared/action-dialog.component';
import { AsyncStateComponent } from '../../shared/async-state.component';
import { IconComponent } from '../../shared/icon.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { FrDateTimePipe } from '../../shared/pipes';
import { BadgeComponent } from '../../shared/status-badge.component';

type SettingType = 'boolean' | 'integer' | 'amount' | 'version' | 'text';

interface SettingView {
  key: string;
  value: string;
  defaultValue: string;
  isDefault: boolean;
  type: SettingType;
  description: string;
  updatedAt: string | null;
  updatedById: string | null;
}

interface SettingChange {
  id: string;
  key: string;
  before: string | null;
  after: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

const GROUPS = [
  {
    prefix: 'solidarity.',
    title: 'Fonds de solidarité volontaire',
    hint: 'N’activez les collectes qu’après validation juridique du dispositif.',
  },
  { prefix: 'mobile.', title: 'Application mobile', hint: 'Versions exigées et mode maintenance.' },
  { prefix: 'support.', title: 'Contacts du support', hint: 'Affichés dans l’application : laissez vide ce qui n’existe pas encore.' },
];

const SETTING_LABELS: Record<string, string> = {
  'solidarity.enabled': 'Collectes activées',
  'solidarity.contribution_amount': 'Participation par dossier approuvé',
  'solidarity.max_assistance_amount': 'Plafond d’aide par dossier',
  'solidarity.waiting_days': 'Délai de carence (jours)',
  'solidarity.rules_version': 'Version du règlement',
  'mobile.min_version': 'Version minimale exigée',
  'mobile.latest_version': 'Dernière version publiée',
  'mobile.maintenance': 'Mode maintenance',
  'mobile.maintenance_message': 'Message de maintenance',
  'support.phone': 'Téléphone',
  'support.whatsapp': 'WhatsApp',
  'support.email': 'E-mail',
  'support.hours': 'Horaires',
  'support.emergency_phone': 'Numéro d’urgence',
};

@Component({
  selector: 'bi-settings-page',
  imports: [FormsModule, ActionDialogComponent, AsyncStateComponent, IconComponent, PageHeaderComponent, BadgeComponent, FrDateTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .setting {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(220px, 340px);
      gap: 16px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--neutral-100);
      align-items: start;
    }
    .setting:last-child {
      border-bottom: none;
    }
    .setting.changed {
      background: var(--accent-50);
    }
    @media (max-width: 760px) {
      .setting {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .sticky-bar {
      position: sticky;
      bottom: 16px;
      z-index: 5;
    }
  `,
  template: `
    <div class="page">
      <bi-page-header title="Paramètres" subtitle="Règles métier modifiables sans redéploiement. Chaque changement est validé par le serveur et tracé avec l'ancienne valeur.">
        <button type="button" class="btn btn-secondary" (click)="reload()"><bi-icon name="refresh" [size]="16" /> Actualiser</button>
      </bi-page-header>

      <bi-async [loading]="settings.loading()" [error]="settings.error()" [hasContent]="!!settings.value()" (retry)="reload()">
        <div class="stack">
          @for (group of groups(); track group.prefix) {
            <section class="card">
              <div class="card-header">
                <div>
                  <h3>{{ group.title }}</h3>
                  <p class="muted small">{{ group.hint }}</p>
                </div>
              </div>
              @for (setting of group.items; track setting.key) {
                <div class="setting" [class.changed]="isChanged(setting)">
                  <div>
                    <div class="row" style="gap: 8px">
                      <label class="strong" [for]="'setting-' + setting.key">{{ label(setting.key) }}</label>
                      @if (setting.isDefault) {
                        <bi-badge>Valeur par défaut</bi-badge>
                      }
                    </div>
                    <p class="small muted">{{ setting.description }}</p>
                    <p class="small muted mono">{{ setting.key }} · défaut : {{ display(setting.type, setting.defaultValue) }}</p>
                    @if (setting.updatedAt) {
                      <p class="small muted">Modifié le {{ setting.updatedAt | frDateTime }} par {{ staff.name(setting.updatedById) }}</p>
                    }
                  </div>
                  <div class="stack-sm">
                    @switch (setting.type) {
                      @case ('boolean') {
                        <select class="input" [id]="'setting-' + setting.key" [ngModel]="value(setting)" (ngModelChange)="setValue(setting.key, $event)">
                          <option value="true">Activé</option>
                          <option value="false">Désactivé</option>
                        </select>
                      }
                      @case ('integer') {
                        <input class="input" type="number" min="0" [id]="'setting-' + setting.key" [ngModel]="value(setting)" (ngModelChange)="setValue(setting.key, $event)" />
                      }
                      @case ('amount') {
                        <input class="input" inputmode="numeric" [id]="'setting-' + setting.key" [ngModel]="value(setting)" (ngModelChange)="setValue(setting.key, $event)" />
                      }
                      @default {
                        @if (setting.key === 'mobile.maintenance_message') {
                          <textarea class="input" rows="3" maxlength="300" [id]="'setting-' + setting.key" [ngModel]="value(setting)" (ngModelChange)="setValue(setting.key, $event)"></textarea>
                        } @else {
                          <input class="input" [id]="'setting-' + setting.key" [ngModel]="value(setting)" (ngModelChange)="setValue(setting.key, $event)" />
                        }
                      }
                    }
                    @for (message of fieldErrors()[setting.key] ?? []; track message) {
                      <span class="field-error">{{ message }}</span>
                    }
                  </div>
                </div>
              }
            </section>
          }

          @if (changes().length > 0) {
            <div class="card card-body row sticky-bar">
              <span class="strong spacer">{{ changes().length }} modification(s) non enregistrée(s)</span>
              <button type="button" class="btn btn-secondary" [disabled]="save.busy()" (click)="discard()">Annuler</button>
              <button type="button" class="btn" [disabled]="save.busy()" (click)="save.reset(); confirmDialog.open()">Enregistrer</button>
            </div>
          }

          <section class="card">
            <div class="card-header"><h3>Historique des modifications</h3></div>
            <bi-async
              [loading]="history.loading()"
              [error]="history.error()"
              [hasContent]="!!history.value()"
              [empty]="!!history.value() && historyItems().length === 0"
              emptyTitle="Aucune modification"
              emptyText="Toutes les valeurs sont celles par défaut."
              (retry)="history.load()"
            >
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Paramètre</th>
                      <th>Ancienne valeur</th>
                      <th>Nouvelle valeur</th>
                      <th>Agent</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (change of historyItems(); track change.id) {
                      <tr>
                        <td class="nowrap">{{ change.createdAt | frDateTime }}</td>
                        <td>
                          {{ label(change.key) }}
                          <div class="cell-sub mono">{{ change.key }}</div>
                        </td>
                        <td class="break">{{ displayKey(change.key, change.before) }}</td>
                        <td class="break">{{ displayKey(change.key, change.after) }}</td>
                        <td>{{ change.actorName ?? '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </bi-async>
          </section>
        </div>
      </bi-async>

      <bi-action-dialog
        #confirmDialog
        title="Enregistrer les paramètres"
        message="Les nouvelles valeurs s'appliquent immédiatement à toute la plateforme."
        confirmLabel="Enregistrer"
        [wide]="true"
        [busy]="save.busy()"
        [error]="save.error()"
        (confirmed)="persist(confirmDialog)"
      >
        @if (enablesCollections()) {
          <div class="alert alert-warning">
            <bi-icon name="alert" [size]="18" />
            <div>Vous activez les collectes de solidarité : les adhérents seront prélevés à chaque dossier d’accident approuvé.</div>
          </div>
        }
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Paramètre</th>
                <th>Actuelle</th>
                <th>Nouvelle</th>
              </tr>
            </thead>
            <tbody>
              @for (change of changes(); track change.key) {
                <tr>
                  <td>{{ label(change.key) }}</td>
                  <td class="break">{{ display(change.type, change.before) }}</td>
                  <td class="break strong">{{ display(change.type, change.after) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </bi-action-dialog>
    </div>
  `,
})
export class SettingsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly staff = inject(StaffDirectory);

  protected readonly settings = new Loadable(() => this.api.get<SettingView[]>('/admin/settings'));
  protected readonly history = new Loadable(() => this.api.get<{ items: SettingChange[] }>('/admin/settings/audit'));
  protected readonly save = new Action();
  private readonly drafts = signal<Record<string, string>>({});

  protected readonly groups = computed(() => {
    const list = this.settings.value() ?? [];
    return GROUPS.map((group) => ({ ...group, items: list.filter((setting) => setting.key.startsWith(group.prefix)) })).filter(
      (group) => group.items.length > 0,
    );
  });

  protected readonly changes = computed(() => {
    const drafts = this.drafts();
    return (this.settings.value() ?? []).flatMap((setting) => {
      const draft = drafts[setting.key];
      return draft !== undefined && draft.trim() !== setting.value
        ? [{ key: setting.key, type: setting.type, before: setting.value, after: draft.trim() }]
        : [];
    });
  });

  protected readonly enablesCollections = computed(() => this.changes().some((change) => change.key === 'solidarity.enabled' && change.after === 'true'));
  protected readonly fieldErrors = computed(() => this.save.failure()?.fields ?? {});

  ngOnInit(): void {
    this.staff.ensureLoaded();
    this.reload();
  }

  protected reload(): void {
    this.drafts.set({});
    this.save.reset();
    void this.settings.load();
    void this.history.load();
  }

  protected historyItems(): SettingChange[] {
    return this.history.value()?.items ?? [];
  }

  protected label(key: string): string {
    return SETTING_LABELS[key] ?? key;
  }

  protected value(setting: SettingView): string {
    return this.drafts()[setting.key] ?? setting.value;
  }

  protected isChanged(setting: SettingView): boolean {
    const draft = this.drafts()[setting.key];
    return draft !== undefined && draft.trim() !== setting.value;
  }

  protected setValue(key: string, value: unknown): void {
    this.drafts.update((drafts) => ({ ...drafts, [key]: value === null || value === undefined ? '' : String(value) }));
  }

  protected discard(): void {
    this.drafts.set({});
    this.save.reset();
  }

  protected display(type: SettingType, value: string | null): string {
    if (value === null) return '—';
    if (value === '') return '(vide)';
    if (type === 'boolean') return value === 'true' ? 'Activé' : 'Désactivé';
    if (type === 'amount') return `${formatAmount(value)} FCFA`;
    return value;
  }

  protected displayKey(key: string, value: string | null): string {
    const type = this.settings.value()?.find((setting) => setting.key === key)?.type ?? 'text';
    return this.display(type, value);
  }

  protected async persist(dialog: ActionDialogComponent): Promise<void> {
    const values = Object.fromEntries(this.changes().map((change) => [change.key, change.after]));
    const result = await this.save.run(() => this.api.patch<SettingView[]>('/admin/settings', { values }));
    if (!result) return;
    this.settings.set(result);
    this.drafts.set({});
    dialog.close();
    this.toast.success('Paramètres enregistrés.');
    void this.history.load();
  }
}
