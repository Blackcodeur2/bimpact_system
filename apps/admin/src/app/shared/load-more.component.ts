import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { PagedList } from '../core/api/loaders';

/** Pied de liste paginée : bouton « Charger plus » et erreur de page suivante. */
@Component({
  selector: 'bi-load-more',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 20px;
      border-top: 1px solid var(--border);
      font-size: 13px;
    }
  `,
  template: `
    @if (list().items().length > 0) {
      <div class="footer">
        <span class="muted">{{ list().items().length }} affiché{{ list().items().length > 1 ? 's' : '' }}</span>
        @if (list().error() && list().loaded()) {
          <span class="field-error">{{ list().error()?.message }}</span>
        }
        @if (list().nextCursor()) {
          <button type="button" class="btn btn-secondary btn-sm" [disabled]="list().loading()" (click)="list().loadMore()">
            @if (list().loading()) {
              <span class="spinner"></span>
            }
            Charger plus
          </button>
        } @else {
          <span class="muted">Fin de la liste</span>
        }
      </div>
    }
  `,
})
export class LoadMoreComponent {
  readonly list = input.required<PagedList<unknown>>();
}
