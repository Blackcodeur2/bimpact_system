import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'bi-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .toasts {
      position: fixed;
      right: 20px;
      bottom: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 100;
      max-width: min(420px, calc(100vw - 40px));
    }
    .toast {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--navy-800);
      color: #fff;
      box-shadow: var(--shadow-raised);
    }
    .toast-success {
      background: var(--growth-700);
    }
    .toast-error {
      background: var(--danger-700);
    }
    .toast span {
      flex: 1;
    }
    .toast button {
      background: none;
      border: none;
      color: inherit;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      opacity: 0.8;
    }
  `,
  template: `
    <router-outlet />
    <div class="toasts" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast" [class.toast-success]="toast.kind === 'success'" [class.toast-error]="toast.kind === 'error'" role="status">
          <span>{{ toast.message }}</span>
          <button type="button" aria-label="Fermer" (click)="toasts.dismiss(toast.id)">×</button>
        </div>
      }
    </div>
  `,
})
export class App {
  protected readonly toasts = inject(ToastService);
}
