import { computed, signal } from '@angular/core';
import { ApiError } from './api-error';
import type { Page } from './api.service';

/**
 * Ressource chargée à la demande : valeur, chargement et erreur exposés en signaux.
 * Une réponse obsolète (rechargement relancé entre-temps) est ignorée.
 */
export class Loadable<T> {
  readonly value = signal<T | null>(null);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  private generation = 0;

  constructor(private readonly fetcher: () => Promise<T>) {}

  async load(): Promise<void> {
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set(null);
    try {
      const value = await this.fetcher();
      if (generation === this.generation) this.value.set(value);
    } catch (error) {
      if (generation === this.generation) this.error.set(ApiError.from(error));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  set(value: T): void {
    this.value.set(value);
  }
}

/** Liste paginée par curseur (« Charger plus »). */
export class PagedList<T> {
  readonly items = signal<T[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<ApiError | null>(null);
  private generation = 0;

  constructor(private readonly fetchPage: (cursor: string | null) => Promise<Page<T>>) {}

  async reload(): Promise<void> {
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.fetchPage(null);
      if (generation !== this.generation) return;
      this.items.set(page.items);
      this.nextCursor.set(page.nextCursor);
      this.loaded.set(true);
    } catch (error) {
      if (generation === this.generation) this.error.set(ApiError.from(error));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.loading()) return;
    const generation = this.generation;
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.fetchPage(cursor);
      if (generation !== this.generation) return;
      this.items.update((items) => [...items, ...page.items]);
      this.nextCursor.set(page.nextCursor);
    } catch (error) {
      if (generation === this.generation) this.error.set(ApiError.from(error));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  /** Remplace un élément modifié sans recharger la liste. */
  replace(predicate: (item: T) => boolean, next: T): void {
    this.items.update((items) => items.map((item) => (predicate(item) ? next : item)));
  }
}

/**
 * Action d'écriture déclenchée par l'agent : occupation et erreur exposées en signaux.
 * Le résultat vaut `undefined` en cas d'échec ; l'écran affiche alors `error()`.
 */
export class Action {
  readonly busy = signal(false);
  readonly failure = signal<ApiError | null>(null);
  /** Message complet, erreurs de validation par champ comprises. */
  readonly error = computed(() => {
    const failure = this.failure();
    if (!failure) return null;
    const details = Object.values(failure.fields).flat();
    return details.length > 0 ? `${failure.message} ${details.join(' ')}` : failure.message;
  });

  async run<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (this.busy()) return undefined;
    this.busy.set(true);
    this.failure.set(null);
    try {
      return await task();
    } catch (error) {
      this.failure.set(ApiError.from(error));
      return undefined;
    } finally {
      this.busy.set(false);
    }
  }

  reset(): void {
    this.failure.set(null);
  }
}
