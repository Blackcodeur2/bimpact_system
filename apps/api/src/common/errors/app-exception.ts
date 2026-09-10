import { HttpException, HttpStatus } from '@nestjs/common';

/** Format d'erreur stable renvoyé par toute l'API (cahier §14). */
export interface ErrorBody {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/**
 * Erreur métier avec code machine stable et message lisible par l'utilisateur.
 * Les clients (Flutter, Angular) se basent sur `code`, jamais sur `message`.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super({ code, message, details } satisfies ErrorBody, status);
  }

  get body(): ErrorBody {
    return this.getResponse() as ErrorBody;
  }
}
