import { Controller, Get, HttpStatus, Module } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/access/access.decorators';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../database/prisma.service';

@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness : le processus répond. */
  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  /** Readiness : les dépendances nécessaires sont joignables. */
  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', checks: { database: 'up' } };
    } catch {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, 'NOT_READY', 'Service indisponible.', {
        checks: { database: 'down' },
      });
    }
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
