import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { AppException, ErrorBody } from './app-exception';

const DEFAULTS: Record<number, [code: string, message: string]> = {
  400: ['BAD_REQUEST', 'La requête est invalide.'],
  401: ['UNAUTHENTICATED', 'Authentification requise.'],
  403: ['FORBIDDEN', "Vous n'avez pas l'autorisation d'effectuer cette action."],
  404: ['NOT_FOUND', 'Ressource introuvable.'],
  405: ['METHOD_NOT_ALLOWED', 'Méthode non autorisée.'],
  409: ['CONFLICT', 'Conflit avec l’état actuel de la ressource.'],
  413: ['PAYLOAD_TOO_LARGE', 'Le contenu envoyé est trop volumineux.'],
  415: ['UNSUPPORTED_MEDIA_TYPE', 'Format de contenu non supporté.'],
  429: ['RATE_LIMITED', 'Trop de tentatives. Réessayez dans quelques instants.'],
  503: ['SERVICE_UNAVAILABLE', 'Service momentanément indisponible.'],
};

/**
 * Convertit toute exception en `{ code, message, details }`.
 * Aucune stack trace ni détail interne n'est renvoyé au client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request & { id?: string }>();
    const { status, body } = this.toResponse(exception);

    if (status >= 500) {
      this.logger.error(
        { err: exception, requestId: req.id, method: req.method, path: req.originalUrl },
        'Erreur non gérée',
      );
    }
    res.status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof AppException) {
      return { status: exception.getStatus(), body: exception.body };
    }
    if (exception instanceof ThrottlerException) {
      return { status: HttpStatus.TOO_MANY_REQUESTS, body: this.fromDefaults(429) };
    }
    if (exception instanceof HttpException) {
      return { status: exception.getStatus(), body: this.fromDefaults(exception.getStatus()) };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      return { status: HttpStatus.CONFLICT, body: this.fromDefaults(409) };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'Une erreur inattendue est survenue.', details: {} },
    };
  }

  private fromDefaults(status: number): ErrorBody {
    const [code, message] = DEFAULTS[status] ?? ['HTTP_ERROR', 'La requête a échoué.'];
    return { code, message, details: {} };
  }
}
