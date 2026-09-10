import { createHash } from 'node:crypto';
import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor, UseInterceptors } from '@nestjs/common';
import { IdempotencyKey, Prisma } from '@prisma/client';
import type { Response } from 'express';
import { lastValueFrom, Observable, of } from 'rxjs';
import { PrismaService } from '../database/prisma.service';
import { UUID_RE } from './crypto';
import { AppException } from './errors/app-exception';
import type { AppRequest } from './request-context';

const RETENTION_MS = 24 * 3600_000;

/**
 * Idempotence HTTP des mutations financières (cahier §10 et §20) :
 * un même en-tête `Idempotency-Key` renvoie la même réponse sans rejouer l'opération.
 * En cas d'échec de l'opération, la clé est libérée pour permettre une nouvelle tentative.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<AppRequest>();
    const res = http.getResponse<Response>();

    const key = req.header('idempotency-key');
    if (!key || !UUID_RE.test(key)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'IDEMPOTENCY_KEY_REQUIRED',
        'En-tête Idempotency-Key (UUID) obligatoire pour cette opération.',
      );
    }

    const identity = {
      ownerKey: req.auth?.userId ?? 'anonymous',
      scope: `${req.method} ${(req.route as { path?: string } | undefined)?.path ?? req.path}`,
      key,
    };
    const where = { ownerKey_scope_key: identity };
    const requestHash = createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');

    const existing = await this.prisma.idempotencyKey.findUnique({ where });
    if (existing) return this.replay(existing, requestHash, res);

    try {
      await this.prisma.idempotencyKey.create({
        data: { ...identity, requestHash, expiresAt: new Date(Date.now() + RETENTION_MS) },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await this.prisma.idempotencyKey.findUnique({ where });
        if (concurrent) return this.replay(concurrent, requestHash, res);
      }
      throw error;
    }

    try {
      const body = await lastValueFrom(next.handle(), { defaultValue: null });
      await this.prisma.idempotencyKey.update({
        where,
        data: { status: 'COMPLETED', responseStatus: res.statusCode, responseBody: toJson(body) },
      });
      return of(body);
    } catch (error) {
      await this.prisma.idempotencyKey.delete({ where }).catch(() => undefined);
      throw error;
    }
  }

  private replay(row: IdempotencyKey, requestHash: string, res: Response): Observable<unknown> {
    if (row.requestHash !== requestHash) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'IDEMPOTENCY_KEY_REUSED',
        'Cette clé d’idempotence a déjà servi pour une requête différente.',
      );
    }
    if (row.status !== 'COMPLETED') {
      throw new AppException(HttpStatus.CONFLICT, 'IDEMPOTENCY_IN_PROGRESS', 'Une requête identique est déjà en cours de traitement.');
    }
    res.setHeader('Idempotent-Replayed', 'true');
    return of(row.responseBody);
  }
}

function toJson(body: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return body === null || body === undefined ? Prisma.JsonNull : (JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue);
}

/** Exige et applique l'en-tête Idempotency-Key sur la route. */
export const Idempotent = () => UseInterceptors(IdempotencyInterceptor);
