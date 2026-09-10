import { Controller, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/access/access.decorators';
import { AuthContext, CurrentAuth } from '../../common/request-context';
import { InAppOnlyPushProvider, NotificationsQueryDto, NotificationsService, PUSH_PROVIDER } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @RequirePermissions('notifications.read.self')
  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: NotificationsQueryDto) {
    return this.notifications.list(auth.userId, query);
  }

  @RequirePermissions('notifications.read.self')
  @Get('unread-count')
  unreadCount(@CurrentAuth() auth: AuthContext) {
    return this.notifications.unreadCount(auth.userId);
  }

  @RequirePermissions('notifications.read.self')
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentAuth() auth: AuthContext) {
    return this.notifications.markAllRead(auth.userId);
  }

  @RequirePermissions('notifications.read.self')
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(auth.userId, id);
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, { provide: PUSH_PROVIDER, useClass: InAppOnlyPushProvider }],
  exports: [NotificationsService],
})
export class NotificationsModule {}
