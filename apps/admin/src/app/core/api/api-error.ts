import { HttpErrorResponse } from '@angular/common/http';

/** Format d'erreur stable de l'API : { code, message, details }. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Erreurs par champ renvoyées par la validation (`details.fields`). */
  get fields(): Record<string, string[]> {
    const fields = this.details['fields'];
    return fields && typeof fields === 'object' ? (fields as Record<string, string[]>) : {};
  }

  field(name: string): string | null {
    return this.fields[name]?.[0] ?? null;
  }

  get isForbidden(): boolean {
    return this.status === 403 && this.code === 'FORBIDDEN';
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return new ApiError(0, 'NETWORK_ERROR', 'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.');
      }
      const body = error.error as Partial<ApiErrorBody> | null;
      if (body && typeof body === 'object' && typeof body.code === 'string') {
        return new ApiError(error.status, body.code, body.message ?? 'Erreur inattendue.', body.details ?? {});
      }
      return new ApiError(error.status, `HTTP_${error.status}`, 'Le serveur a renvoyé une erreur inattendue. Réessayez plus tard.');
    }
    return new ApiError(0, 'UNKNOWN_ERROR', 'Une erreur inattendue est survenue.');
  }
}
