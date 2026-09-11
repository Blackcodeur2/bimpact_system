import { Body, Controller, Get, HttpCode, HttpStatus, Module, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDate, IsObject, IsOptional, IsUUID, Matches, ValidateNested } from 'class-validator';
import { Public } from '../../common/access/access.decorators';
import { money } from '../../common/money';
import { Ctx, RequestContext } from '../../common/request-context';
import { AppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../settings/settings.service';

/** Configuration distante lue au démarrage de l'application (cahier §7.1). Aucune donnée personnelle. */
@ApiTags('config')
@Controller('config')
export class MobileConfigController {
  constructor(
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('mobile')
  async mobile() {
    const v = await this.settings.values([
      'mobile.min_version',
      'mobile.latest_version',
      'mobile.maintenance',
      'mobile.maintenance_message',
      'solidarity.enabled',
      'support.phone',
      'support.whatsapp',
      'support.email',
      'support.hours',
      'support.emergency_phone',
    ]);
    const orNull = (value: string) => (value.trim() === '' ? null : value.trim());
    return {
      serverTime: new Date(),
      minVersion: v['mobile.min_version'],
      latestVersion: v['mobile.latest_version'],
      maintenance: { enabled: v['mobile.maintenance'] === 'true', message: orNull(v['mobile.maintenance_message']) },
      features: {
        paymentsTestMode: this.config.payments.provider === 'sandbox',
        solidarityCollections: v['solidarity.enabled'] === 'true',
      },
      contribution: { dailyAmount: money(this.config.contributions.dailyAmount) },
      /** Contacts réellement configurés ; null si l'équipe ne les a pas encore renseignés. */
      support: {
        phone: orNull(v['support.phone']),
        whatsapp: orNull(v['support.whatsapp']),
        email: orNull(v['support.email']),
        hours: orNull(v['support.hours']),
        emergencyPhone: orNull(v['support.emergency_phone']),
      },
    };
  }
}

const EVENT_NAME_RE = /^[a-z][a-z0-9_.]{1,63}$/;
const MAX_PROPERTIES_LENGTH = 2000;

export class AnalyticsEventDto {
  @Matches(EVENT_NAME_RE, { message: 'Nom d’évènement invalide (ex. onboarding.completed).' })
  name: string;

  @Type(() => Date)
  @IsDate()
  occurredAt: Date;

  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}

export class AnalyticsBatchDto {
  @IsOptional()
  @IsUUID()
  installationId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AnalyticsEventDto)
  events: AnalyticsEventDto[];
}

/** Ne conserve que des valeurs simples (texte court, nombre, booléen) : aucune structure ne peut transporter de données sensibles. */
export function sanitizeProperties(properties: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  if (!properties) return undefined;
  const kept: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties).slice(0, 20)) {
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(key)) continue;
    if (typeof value === 'string') kept[key] = value.slice(0, 120);
    else if (typeof value === 'number' && Number.isFinite(value)) kept[key] = value;
    else if (typeof value === 'boolean') kept[key] = value;
  }
  const json = JSON.stringify(kept);
  return json.length > MAX_PROPERTIES_LENGTH || json === '{}' ? undefined : kept;
}

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Évènements d'usage (cahier §7.2). Accessible hors session (onboarding) ; rattaché au membre s'il est connecté. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  async record(@Body() dto: AnalyticsBatchDto, @Ctx() ctx: RequestContext) {
    const now = Date.now();
    const events = dto.events.filter((event) => Math.abs(event.occurredAt.getTime() - now) <= 30 * 86_400_000);
    if (events.length > 0) {
      await this.prisma.analyticsEvent.createMany({
        data: events.map((event) => ({
          userId: ctx.auth?.userId ?? null,
          installationId: dto.installationId ?? null,
          name: event.name,
          occurredAt: event.occurredAt,
          properties: sanitizeProperties(event.properties),
        })),
      });
    }
    return { accepted: events.length };
  }
}

@Module({ controllers: [MobileConfigController, AnalyticsController] })
export class PlatformModule {}
