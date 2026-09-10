import { Controller, Get, Global, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { RequirePermissions } from '../../common/access/access.decorators';
import { afterCursor, CursorQueryDto, toPage } from '../../common/pagination';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from './audit.service';

class AuditLogQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  resourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  resourceId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

/** Consultation des journaux d'audit (cahier §8.18) — lecture seule. */
@ApiTags('admin / audit')
@ApiBearerAuth()
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions('admin.audit.read')
  @Get()
  async list(@Query() query: AuditLogQueryDto) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        actorId: query.actorId,
        action: query.action,
        resourceType: query.resourceType,
        resourceId: query.resourceId,
        createdAt: { gte: query.from, lte: query.to },
        ...afterCursor(query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return toPage(rows, query.limit, (row) => row);
  }
}

@Global()
@Module({
  controllers: [AdminAuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
