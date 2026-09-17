import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from './icon.component';

@Component({
  selector: 'bi-page-header',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .subtitle {
      margin-top: 4px;
      color: var(--text-muted);
      max-width: 780px;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
  `,
  template: `
    <div>
      @if (backLink()) {
        <a class="back" [routerLink]="backLink()"><bi-icon name="arrow-left" [size]="16" /> {{ backLabel() }}</a>
      }
      <h1>{{ title() }}</h1>
      @if (subtitle()) {
        <p class="subtitle">{{ subtitle() }}</p>
      }
    </div>
    <div class="actions"><ng-content /></div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly backLink = input<string | null>(null);
  readonly backLabel = input('Retour');
}
