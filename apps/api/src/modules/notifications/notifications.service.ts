import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Notification, Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { AppException } from '../../common/errors/app-exception';
import { afterCursor, CursorQueryDto, Page, toPage } from '../../common/pagination';
import { PrismaService, Tx } from '../../database/prisma.service';

export interface NotificationInput {
  type: string;
  title: string;
  body: string;
  deepLink?: string;
  data?: Record<string, unknown>;
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  deepLink: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

/** Envoi de notifications système (FCM, SMS…) : abstraction du cahier §20. */
export interface PushProvider {
  readonly name: string;
  send(userId: string, notification: NotificationInput): Promise<void>;
}

/**
 * Notifications visibles dans l'application (centre de notifications et badge).
 * Aucun push système n'est émis tant qu'aucun fournisseur (ex. Firebase Cloud Messaging) n'est configuré.
 */
@Injectable()
export class InAppOnlyPushProvider implements PushProvider {
  readonly name = 'in-app';
  async send(): Promise<void> {}
}

export class NotificationsQueryDto extends CursorQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
  ) {}

  /** Crée la notification (dans la transaction métier si fournie) puis tente l'envoi système. */
  async notify(userId: string, input: NotificationInput, tx?: Tx): Promise<Notification> {
    const notification = await (tx ?? this.prisma).notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        deepLink: input.deepLink ?? null,
        data: input.data ? (input.data as Prisma.InputJsonValue) : undefined,
      },
    });
    if (!tx) {
      await this.push.send(userId, input).catch((error: unknown) =>
        this.logger.warn({ err: error, userId, type: input.type }, 'Envoi push impossible'),
      );
    }
    return notification;
  }

  async list(userId: string, query: NotificationsQueryDto): Promise<Page<NotificationView>> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(query.unreadOnly ? { readAt: null } : {}), ...afterCursor(query.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return toPage(rows, query.limit, toView);
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  async markRead(userId: string, id: string): Promise<NotificationView> {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) {
      throw new AppException(HttpStatus.NOT_FOUND, 'NOTIFICATION_NOT_FOUND', 'Notification introuvable.');
    }
    if (notification.readAt) return toView(notification);
    return toView(await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } }));
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: count };
  }
}

function toView(notification: Notification): NotificationView {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    deepLink: notification.deepLink,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}
