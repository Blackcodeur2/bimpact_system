import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ApiService } from '../core/api/api.service';
import { formatBytes, formatDateTime } from '../core/format';
import { IconComponent } from './icon.component';

/** Pièce privée telle que renvoyée par l'API : l'URL est signée et temporaire. */
export interface StoredDocument {
  id: string;
  type: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  uploadedAt?: string | null;
  createdAt?: string | null;
}

@Component({
  selector: 'bi-document-list',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .doc {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--neutral-100);
    }
    .doc:last-child {
      border-bottom: none;
    }
    .doc-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: var(--primary-50);
      color: var(--primary-700);
      flex: none;
    }
  `,
  template: `
    @for (doc of documents(); track doc.id) {
      <div class="doc">
        <span class="doc-icon"><bi-icon name="file" [size]="18" /></span>
        <div class="spacer">
          <div class="strong">{{ labels()[doc.type] ?? doc.type }}</div>
          <div class="small muted">{{ describe(doc) }}</div>
        </div>
        <a class="btn btn-secondary btn-sm" [href]="url(doc)" target="_blank" rel="noopener">
          <bi-icon name="external" [size]="14" /> Ouvrir
        </a>
      </div>
    } @empty {
      <p class="muted small">Aucun document transmis.</p>
    }
  `,
})
export class DocumentListComponent {
  private readonly api = inject(ApiService);
  readonly documents = input.required<StoredDocument[]>();
  readonly labels = input<Record<string, string>>({});

  protected url(doc: StoredDocument): string {
    return this.api.fileUrl(doc.url);
  }

  protected describe(doc: StoredDocument): string {
    const kind = doc.mimeType === 'application/pdf' ? 'PDF' : doc.mimeType.startsWith('image/') ? 'Image' : doc.mimeType;
    return `${kind} · ${formatBytes(doc.sizeBytes)} · ${formatDateTime(doc.uploadedAt ?? doc.createdAt ?? null)}`;
  }
}
