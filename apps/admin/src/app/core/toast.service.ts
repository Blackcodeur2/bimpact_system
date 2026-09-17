import { Injectable, signal } from '@angular/core';
import { ApiError } from './api/api-error';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

/** Messages de confirmation ou d'erreur, affichés quelques secondes. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  success(message: string): void {
    this.push('success', message);
  }

  info(message: string): void {
    this.push('info', message);
  }

  error(error: unknown): void {
    this.push('error', typeof error === 'string' ? error : ApiError.from(error).message);
  }

  dismiss(id: number): void {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  private push(kind: Toast['kind'], message: string): void {
    const id = this.nextId++;
    this.toasts.update((toasts) => [...toasts.slice(-3), { id, kind, message }]);
    setTimeout(() => this.dismiss(id), kind === 'error' ? 7000 : 4500);
  }
}
