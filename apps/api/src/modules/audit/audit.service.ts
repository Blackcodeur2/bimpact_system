import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RequestContext } from '../../common/request-context';
import { PrismaService, Tx } from '../../database/prisma.service';

const SENSITIVE_KEYS = new Set([
  'pin',
  'pinHash',
  'code',
  'codeHash',
  'refreshToken',
  'refreshTokenHash',
  'accessToken',
  'password',
  'secret',
]);

export type ActorType = 'MEMBER' | 'STAFF' | 'SYSTEM';

export interface AuditInput {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  /** Acteur explicite ; sinon déduit du contexte d'authentification. */
  actorId?: string | null;
  actorType?: ActorType;
}

/** Retire les secrets et convertit Decimal/Date en valeurs JSON. */
export function sanitizeForAudit(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v: unknown) => (SENSITIVE_KEYS.has(key) ? '[REDACTED]' : v)),
  ) as Prisma.InputJsonValue;
}

/**
 * Journal d'audit immuable (UPDATE/DELETE bloqués par trigger).
 * Passer `tx` pour que l'audit soit atomique avec l'action auditée.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput, ctx: RequestContext = {}, tx?: Tx): Promise<void> {
    const client = tx ?? this.prisma;
    const actorId = input.actorId !== undefined ? input.actorId : (ctx.auth?.userId ?? null);
    const actorType: ActorType = input.actorType ?? ctx.auth?.kind ?? 'SYSTEM';

    await client.auditLog.create({
      data: {
        actorId,
        actorType,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        before: sanitizeForAudit(input.before),
        after: sanitizeForAudit(input.after),
        metadata: sanitizeForAudit(input.metadata),
        requestId: ctx.requestId ?? null,
        ipHash: ctx.ipHash ?? null,
      },
    });
  }
}
