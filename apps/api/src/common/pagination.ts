import { HttpStatus } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { UUID_RE } from './crypto';
import { AppException } from './errors/app-exception';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Pagination par curseur (created_at DESC, id DESC) : stable et indexable à grande échelle. */
export class CursorQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export interface CursorPosition {
  createdAt: Date;
  id: string;
}

export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(`${position.createdAt.toISOString()}|${position.id}`).toString('base64url');
}

export function decodeCursor(cursor: string): CursorPosition {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso ?? '');
  if (Number.isNaN(createdAt.getTime()) || !id || !UUID_RE.test(id)) {
    throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_CURSOR', 'Curseur de pagination invalide.');
  }
  return { createdAt, id };
}

/** Clause Prisma « strictement après le curseur » pour un tri (createdAt DESC, id DESC). */
export function afterCursor(cursor?: string) {
  if (!cursor) return {};
  const { createdAt, id } = decodeCursor(cursor);
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
}

/** Découpe `limit + 1` lignes en page + curseur suivant. */
export function toPage<T extends CursorPosition, R>(rows: T[], limit: number, map: (row: T) => R): Page<R> {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  return {
    items: pageRows.map(map),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}
