import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface ChartPoint {
  label: string;
  value: number;
  /** Valeur affichée dans l'infobulle (montant formaté, etc.). */
  display?: string;
}

const WIDTH = 640;
const HEIGHT = 180;
const PAD_TOP = 12;
const PAD_BOTTOM = 8;

/** Courbe simple en SVG (aucune bibliothèque externe). */
@Component({
  selector: 'bi-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    svg {
      width: 100%;
      height: auto;
      display: block;
      overflow: visible;
    }
    .grid {
      stroke: var(--neutral-100);
      stroke-width: 1;
    }
    .line {
      fill: none;
      stroke: var(--chart-color, var(--primary-500));
      stroke-width: 2.5;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .area {
      fill: var(--chart-color, var(--primary-500));
      opacity: 0.08;
    }
    .dot {
      fill: var(--surface);
      stroke: var(--chart-color, var(--primary-500));
      stroke-width: 2;
    }
    .axis {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 6px;
    }
    .max {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
  `,
  template: `
    <div class="max">Max : {{ maxLabel() }}</div>
    <svg [attr.viewBox]="viewBox" role="img" [attr.aria-label]="ariaLabel()" [style.--chart-color]="color()">
      @for (y of gridLines; track y) {
        <line class="grid" x1="0" [attr.x2]="width" [attr.y1]="y" [attr.y2]="y" />
      }
      <path class="area" [attr.d]="geometry().area" />
      <path class="line" [attr.d]="geometry().line" />
      @for (dot of geometry().dots; track $index) {
        <circle class="dot" [attr.cx]="dot.x" [attr.cy]="dot.y" r="3">
          <title>{{ dot.title }}</title>
        </circle>
      }
    </svg>
    <div class="axis">
      <span>{{ points()[0]?.label }}</span>
      <span>{{ points()[points().length - 1]?.label }}</span>
    </div>
  `,
})
export class LineChartComponent {
  readonly points = input.required<ChartPoint[]>();
  readonly ariaLabel = input('Graphique');
  readonly color = input('var(--primary-500)');

  protected readonly width = WIDTH;
  protected readonly viewBox = `0 0 ${WIDTH} ${HEIGHT}`;
  protected readonly gridLines = [PAD_TOP, (HEIGHT - PAD_BOTTOM + PAD_TOP) / 2, HEIGHT - PAD_BOTTOM];

  protected readonly max = computed(() => Math.max(0, ...this.points().map((p) => p.value)));
  protected readonly maxLabel = computed(() => {
    const top = this.points().reduce<ChartPoint | null>((best, p) => (!best || p.value > best.value ? p : best), null);
    return top ? (top.display ?? String(top.value)) : '—';
  });

  protected readonly geometry = computed(() => {
    const points = this.points();
    const max = this.max() || 1;
    const step = points.length > 1 ? WIDTH / (points.length - 1) : 0;
    const usable = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const dots = points.map((p, i) => ({
      x: Math.round(i * step * 10) / 10,
      y: Math.round((PAD_TOP + usable - (p.value / max) * usable) * 10) / 10,
      title: `${p.label} : ${p.display ?? p.value}`,
    }));
    const line = dots.map((d, i) => `${i === 0 ? 'M' : 'L'}${d.x},${d.y}`).join(' ');
    const last = dots[dots.length - 1];
    const area = dots.length > 0 && last ? `${line} L${last.x},${HEIGHT - PAD_BOTTOM} L0,${HEIGHT - PAD_BOTTOM} Z` : '';
    return { dots: points.length <= 45 ? dots : [], line, area };
  });
}

export interface BarItem {
  label: string;
  value: number;
  display?: string;
}

/** Barres horizontales proportionnelles (répartition par ville, par statut…). */
@Component({
  selector: 'bi-bar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .bar-row {
      display: grid;
      grid-template-columns: minmax(90px, 160px) 1fr auto;
      gap: 10px;
      align-items: center;
      font-size: 13px;
      padding: 5px 0;
    }
    .track {
      height: 8px;
      border-radius: 999px;
      background: var(--neutral-100);
      overflow: hidden;
    }
    .fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--primary-500), var(--growth-500));
    }
    .label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .value {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
  `,
  template: `
    @for (item of items(); track item.label) {
      <div class="bar-row">
        <span class="label" [title]="item.label">{{ item.label }}</span>
        <div class="track"><div class="fill" [style.width.%]="(item.value / max()) * 100"></div></div>
        <span class="value">{{ item.display ?? item.value }}</span>
      </div>
    }
  `,
})
export class BarListComponent {
  readonly items = input.required<BarItem[]>();
  protected readonly max = computed(() => Math.max(1, ...this.items().map((item) => item.value)));
}
