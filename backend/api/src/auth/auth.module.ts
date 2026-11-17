import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthService, prisma } from "@boneyard/skeleton-core";
import { AuthController } from "./auth.controller";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AuthService,
      useFactory: (config: ConfigService) => {
        const jwtSecret = config.get<string>("JWT_SECRET");
        if (!jwtSecret) {
          throw new Error(
            "JWT_SECRET is not set — check backend/api/.env (see .env.example)"
          );
        }
        // Shares skeleton-core's single Prisma client singleton rather than
        // opening a second connection pool.
        return new AuthService(prisma, jwtSecret);
      },
      inject: [ConfigService],
    },
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
