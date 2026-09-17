import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ApiError } from '../core/api/api-error';
import { IconComponent } from './icon.component';

/**
 * États obligatoires d'un écran (cahier §8) : chargement, erreur, accès refusé, vide.
 * Le contenu reste affiché pendant un rechargement si `hasContent` est vrai.
 */
@Component({
  selector: 'bi-async',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .state {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
      padding: 40px 20px;
      color: var(--text-muted);
    }
    .state h3 {
      color: var(--text);
    }
    .state-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: var(--neutral-100);
      color: var(--neutral-600);
    }
    .state-icon.danger {
      background: var(--danger-50);
      color: var(--danger-700);
    }
    .loading {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 20px;
    }
    .loading div {
      height: 16px;
    }
  `,
  template: `
    @if (error(); as err) {
      <div class="state" role="alert">
        @if (err.isForbidden) {
          <span class="state-icon"><bi-icon name="lock" /></span>
          <h3>Accès refusé</h3>
          <p>Vos rôles ne permettent pas de consulter ces informations.</p>
        } @else {
          <span class="state-icon danger"><bi-icon name="alert" /></span>
          <h3>Chargement impossible</h3>
          <p>{{ err.message }}</p>
          <button type="button" class="btn btn-secondary btn-sm" (click)="retry.emit()">
            <bi-icon name="refresh" [size]="16" /> Réessayer
          </button>
        }
      </div>
    } @else if (loading() && !hasContent()) {
      <div class="loading" aria-busy="true" aria-label="Chargement">
        <div class="skeleton" style="width: 60%"></div>
        <div class="skeleton"></div>
        <div class="skeleton" style="width: 85%"></div>
        <div class="skeleton" style="width: 40%"></div>
      </div>
    } @else if (empty()) {
      <div class="state">
        <span class="state-icon"><bi-icon name="file" /></span>
        <h3>{{ emptyTitle() }}</h3>
        @if (emptyText()) {
          <p>{{ emptyText() }}</p>
        }
      </div>
    } @else {
      <ng-content />
    }
  `,
})
export class AsyncStateComponent {
  readonly loading = input(false);
  readonly error = input<ApiError | null>(null);
  readonly empty = input(false);
  readonly hasContent = input(false);
  readonly emptyTitle = input('Aucun élément');
  readonly emptyText = input('');
  readonly retry = output<void>();
}
