import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import type { RequestContext } from '../../common/request-context';
import type { PrismaService } from '../../database/prisma.service';

export const DAY_MS = 86_400_000;
/** Le Cameroun est à UTC+1 toute l'année (pas d'heure d'été). */
const DOUALA_OFFSET_MS = 3_600_000;

/** Jour calendaire au Cameroun (AAAA-MM-JJ). */
export function localDayKey(date: Date): string {
  return new Date(date.getTime() + DOUALA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Bornes UTC d'une journée calendaire du Cameroun. */
export function localDayBounds(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00.000+01:00`);
  return { start, end: new Date(start.getTime() + DAY_MS - 1) };
}

/** Jours consécutifs entre deux jours calendaires inclus. */
export function dayKeys(from: string, to: string): string[] {
  const keys: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
    keys.push(new Date(t).toISOString().slice(0, 10));
  }
  return keys;
}

export interface DailyBucket {
  count: number;
  sum: string;
}

/**
 * Agrégat quotidien (heure du Cameroun) d'une table sur une colonne de date.
 * `table`, `column` et `sumColumn` sont des constantes du code, jamais des entrées utilisateur.
 */
export async function dailyBuckets(
  prisma: PrismaService,
  params: { table: string; column: string; from: Date; to: Date; sumColumn?: string; where?: Prisma.Sql },
): Promise<Map<string, DailyBucket>> {
  const column = Prisma.raw(params.column);
  const rows = await prisma.$queryRaw<{ day: string; count: number; sum: string }[]>`
    SELECT to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Douala', 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS count,
           ${params.sumColumn ? Prisma.raw(`COALESCE(SUM(${params.sumColumn}), 0)::text`) : Prisma.raw(`'0'`)} AS sum
    FROM ${Prisma.raw(params.table)}
    WHERE ${column} >= ${params.from.toISOString()}::timestamp
      AND ${column} <= ${params.to.toISOString()}::timestamp
      ${params.where ? Prisma.sql`AND ${params.where}` : Prisma.empty}
    GROUP BY 1`;
  return new Map(rows.map((row) => [row.day, { count: row.count, sum: row.sum }]));
}

export function fullName(profile: { firstName: string; lastName: string } | null | undefined): string | null {
  return profile ? `${profile.firstName} ${profile.lastName}`.trim() : null;
}

/** Noms affichables des agents (réviseurs, auteurs de notes…) à partir de leurs identifiants. */
export async function staffNames(prisma: PrismaService, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } },
  });
  return new Map(users.map((user) => [user.id, fullName(user.profile) ?? user.email ?? 'Compte inconnu']));
}

export function requireActor(ctx: RequestContext): string {
  if (!ctx.auth) throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Authentification requise.');
  return ctx.auth.userId;
}

/** Masque un identifiant sensible (numéro de pièce) : seuls les 3 derniers caractères restent visibles. */
export function maskIdentifier(value: string): string {
  return value.length <= 3 ? '***' : `${'*'.repeat(Math.min(value.length - 3, 8))}${value.slice(-3)}`;
}
