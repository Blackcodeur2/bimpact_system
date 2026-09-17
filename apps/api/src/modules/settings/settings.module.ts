import { Body, Controller, Get, Global, Module, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { RequirePermissions } from '../../common/access/access.decorators';
import { Ctx, RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from './settings.service';

export class UpdateSettingsDto {
  /** { "solidarity.enabled": "true", "support.phone": "+237…" } */
  @IsObject()
  values: Record<string, unknown>;
}

@ApiTags('admin / settings')
@ApiBearerAuth()
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermissions('admin.settings.manage')
  @Get()
  list() {
    return this.settings.list();
  }

  @RequirePermissions('admin.settings.manage')
  @Patch()
  update(@Body() dto: UpdateSettingsDto, @Ctx() ctx: RequestContext) {
    return this.settings.update(dto.values, ctx);
  }

  /** Historique des changements de paramètres (ancienne et nouvelle valeur, auteur). */
  @RequirePermissions('admin.settings.manage')
  @Get('audit')
  async history() {
    const rows = await this.prisma.auditLog.findMany({
      where: { resourceType: 'system_setting' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    const actorIds = [...new Set(rows.map((row) => row.actorId).filter((id): id is string => Boolean(id)))];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } },
    });
    const names = new Map(
      actors.map((actor) => [actor.id, actor.profile ? `${actor.profile.firstName} ${actor.profile.lastName}` : (actor.email ?? '')]),
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        key: row.resourceId,
        before: (row.before as { value?: string } | null)?.value ?? null,
        after: (row.after as { value?: string } | null)?.value ?? null,
        actorId: row.actorId,
        actorName: row.actorId ? (names.get(row.actorId) ?? null) : null,
        createdAt: row.createdAt,
      })),
    };
  }
}

@Global()
@Module({
  controllers: [AdminSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
