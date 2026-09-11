import { Body, Controller, Get, Global, Module, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { RequirePermissions } from '../../common/access/access.decorators';
import { Ctx, RequestContext } from '../../common/request-context';
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
  constructor(private readonly settings: SettingsService) {}

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
}

@Global()
@Module({
  controllers: [AdminSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
