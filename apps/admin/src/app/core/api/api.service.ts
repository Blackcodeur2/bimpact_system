import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiError } from './api-error';

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

/** Montant tel que renvoyé par l'API : chaîne décimale, jamais de nombre flottant. */
export interface Money {
  amount: string;
  currency: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Accès HTTP à l'API /v1. Toutes les erreurs sont converties en ApiError. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  readonly baseUrl = environment.apiBaseUrl;

  get<T>(path: string, query?: Query): Promise<T> {
    return this.request<T>('GET', path, { query });
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>('POST', path, { body });
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, { body });
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, { body });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path, {});
  }

  /** Les documents privés sont servis par URL signée relative à l'origine de l'API (« /v1/files/… »). */
  fileUrl(path: string): string {
    const api = new URL(this.baseUrl, window.location.origin);
    return new URL(path, api.origin).toString();
  }

  private async request<T>(method: string, path: string, options: { body?: unknown; query?: Query }): Promise<T> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    try {
      return await firstValueFrom(this.http.request<T>(method, `${this.baseUrl}${path}`, { body: options.body, params }));
    } catch (error) {
      throw ApiError.from(error);
    }
  }
}
