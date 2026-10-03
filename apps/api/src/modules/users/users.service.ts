import { HttpStatus, Injectable } from '@nestjs/common';
import type { KycStatus, UserKind, UserStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UpdateMeDto } from './users.dto';

export interface MeView {
  id: string;
  phone: string;
  email: string | null;
  username: string | null;
  kind: UserKind;
  status: UserStatus;
  createdAt: Date;
  profile: {
    firstName: string;
    lastName: string;
    city: string;
    zone: string | null;
    kycStatus: KycStatus;
  };
  roles: string[];
  /** Capacités effectives : le client adapte l'affichage, le serveur reste seul juge. */
  permissions: string[];
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getMe(userId: string): Promise<MeView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
    if (!user?.profile) {
      throw new AppException(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'Utilisateur introuvable.');
    }
    return {
      id: user.id,
      phone: user.phone,
      email: user.email ?? null,
      username: user.username ?? null,
      kind: user.kind,
      status: user.status,
      createdAt: user.createdAt,
      profile: {
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        city: user.profile.city,
        zone: user.profile.zone,
        kycStatus: user.profile.kycStatus,
      },
      roles: user.roles.map((r) => r.role.code).sort(),
      permissions: [...new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)))].sort(),
    };
  }

  async updateMe(userId: string, dto: UpdateMeDto, ctx: RequestContext): Promise<MeView> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.profile.findUniqueOrThrow({ where: { userId } });
      const after = await tx.profile.update({ where: { userId }, data: dto });
      await this.audit.record(
        {
          action: 'profile.updated',
          resourceType: 'profile',
          resourceId: userId,
          before: { firstName: before.firstName, lastName: before.lastName, city: before.city, zone: before.zone },
          after: { firstName: after.firstName, lastName: after.lastName, city: after.city, zone: after.zone },
        },
        ctx,
        tx,
      );
    });
    return this.getMe(userId);
  }
}
