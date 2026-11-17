import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Role, type AuthUser } from "@boneyard/skeleton-core";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { NotificationsService } from "./notifications.service";
import { RegisterDeviceDto } from "./dto/register-device.dto";
import { UnregisterDeviceDto } from "./dto/unregister-device.dto";
import { ListNotificationsDto } from "./dto/list-notifications.dto";
import { BroadcastNotificationDto } from "./dto/broadcast-notification.dto";
import { UpdateNotificationPreferencesDto } from "./dto/update-preferences.dto";

@ApiTags("notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService
  ) {}

  @ApiOperation({ summary: "Register an Expo push token for the authenticated device" })
  @Post("devices")
  registerDevice(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterDeviceDto
  ) {
    return this.notificationsService.registerPushToken(user.id, dto);
  }

  @ApiOperation({ summary: "Unregister/deactivate an Expo push token (e.g. on logout)" })
  @Post("devices/unregister")
  unregisterDevice(
    @CurrentUser() user: AuthUser,
    @Body() dto: UnregisterDeviceDto
  ) {
    return this.notificationsService.unregisterPushToken(user.id, dto.token);
  }

  @ApiOperation({ summary: "Unregister/deactivate an Expo push token by path parameter" })
  @Delete("devices/:token")
  unregisterDeviceByParam(
    @CurrentUser() user: AuthUser,
    @Param("token") token: string
  ) {
    return this.notificationsService.unregisterPushToken(user.id, token);
  }

  @ApiOperation({ summary: "List paginated in-app notifications for the authenticated user" })
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListNotificationsDto
  ) {
    return this.notificationsService.listUserNotifications(user.id, query);
  }

  @ApiOperation({ summary: "Get total unread in-app notification count for badge counters" })
  @Get("unread-count")
  getUnreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @ApiOperation({ summary: "Mark a single in-app notification as read" })
  @Patch(":id/read")
  markAsRead(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string
  ) {
    return this.notificationsService.markAsRead(user.id, id);
  }

  @ApiOperation({ summary: "Mark all unread in-app notifications as read" })
  @Patch("read-all")
  markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @ApiOperation({ summary: "Get user notification preferences" })
  @Get("preferences")
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getPreferences(user.id);
  }

  @ApiOperation({ summary: "Update user notification preferences" })
  @Patch("preferences")
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateNotificationPreferencesDto
  ) {
    return this.notificationsService.updatePreferences(user.id, dto);
  }

  @ApiOperation({ summary: "[admin] Broadcast a push + in-app notification to all or filtered users" })
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @Post("admin/broadcast")
  broadcast(
    @CurrentUser() admin: AuthUser,
    @Body() dto: BroadcastNotificationDto
  ) {
    return this.notificationsService.broadcast(admin.id, dto);
  }
}
