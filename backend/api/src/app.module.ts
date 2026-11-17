import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { envValidationSchema } from "./config/env.validation";
import { AuthModule } from "./auth/auth.module";
import { ListingsModule } from "./listings/listings.module";
import { RequestsModule } from "./requests/requests.module";
import { AdminModule } from "./admin/admin.module";
import { HealthModule } from "./health/health.module";
import { PaymentsModule } from "./payments/payments.module";
import { NotificationsModule } from "./notifications/notifications.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    AuthModule,
    ListingsModule,
    RequestsModule,
    AdminModule,
    PaymentsModule,
    NotificationsModule,
    HealthModule,
  ],
})
export class AppModule {}
