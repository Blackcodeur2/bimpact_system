import { inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api/api.service';

export interface StaffDirectoryEntry {
  id: string;
  name: string;
  status: string;
}

/** Noms des agents (réviseurs, auteurs d'actions), chargés une seule fois par session. */
@Injectable({ providedIn: 'root' })
export class StaffDirectory {
  private readonly api = inject(ApiService);
  private readonly names = signal<ReadonlyMap<string, string>>(new Map());
  readonly entries = signal<StaffDirectoryEntry[]>([]);
  private requested = false;

  /** Nom de l'agent ; identifiant abrégé tant que l'annuaire n'est pas chargé. */
  name(id: string | null | undefined): string {
    if (!id) return '—';
    return this.names().get(id) ?? `Agent ${id.slice(0, 8)}`;
  }

  ensureLoaded(): void {
    if (this.requested) return;
    this.requested = true;
    this.api.get<{ items: StaffDirectoryEntry[] }>('/admin/staff-directory').then(
      (result) => {
        this.entries.set(result.items);
        this.names.set(new Map(result.items.map((entry) => [entry.id, entry.name])));
      },
      () => {
        // Annuaire indisponible : les identifiants abrégés restent affichés, nouvel essai à l'écran suivant.
        this.requested = false;
      },
    );
  }
}
