import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { StatusDomain, statusLabel, Tone } from '../core/labels';

@Component({
  selector: 'bi-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="classes()">{{ item().label }}</span>`,
})
export class StatusBadgeComponent {
  readonly domain = input.required<StatusDomain>();
  readonly code = input.required<string | null | undefined>();
  protected readonly item = computed(() => statusLabel(this.domain(), this.code()));
  protected readonly classes = computed(() => `badge badge-${this.item().tone}`);
}

/** Badge libre (texte et couleur fournis). */
@Component({
  selector: 'bi-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'badge badge-' + tone()"><ng-content /></span>`,
})
export class BadgeComponent {
  readonly tone = input<Tone>('neutral');
}
