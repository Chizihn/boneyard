import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PushService } from "./push.service";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [PushService, NotificationsService],
  exports: [PushService, NotificationsService],
})
export class NotificationsModule {}
