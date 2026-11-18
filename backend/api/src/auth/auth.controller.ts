import { Body, Controller, Delete, Get, HttpCode, Inject, Optional, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthService, Role } from "@boneyard/skeleton-core";
import type { AuthUser } from "@boneyard/skeleton-core";
import { NotificationsService } from "../notifications/notifications.service";
import { SignupDto } from "./dto/signup.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { DeleteAccountDto } from "./dto/delete-account.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { Roles } from "./decorators/roles.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  // Explicit @Inject rather than relying on TS's emitted design:paramtypes
  // metadata: esbuild (what vitest uses to transform .ts) doesn't implement
  // emitDecoratorMetadata, so implicit constructor injection silently
  // resolves to undefined under the test runner even though it works fine
  // under tsc/ts-node. Explicit tokens work under both.
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Optional() @Inject(NotificationsService) private readonly notifications?: NotificationsService
  ) {}

  @ApiOperation({ summary: "Create a requester or provider account (admin cannot self-signup)" })
  @Post("signup")
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @ApiOperation({ summary: "Log in and receive a short-lived access token + a refresh token" })
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @ApiOperation({
    summary: "Rotate a refresh token for a new access+refresh pair (the old refresh token is revoked)",
  })
  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @ApiOperation({ summary: "Revoke a refresh token (idempotent)" })
  @Post("logout")
  async logout(@Body() dto: RefreshDto) {
    await this.authService.logout(dto.refreshToken);
    return { success: true };
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the currently authenticated user" })
  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: "Delete (soft) the current account — requires the current password to confirm",
  })
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Delete("me")
  async deleteMe(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto) {
    await this.authService.deleteAccount(user.id, dto.password);
  }

  // Admin-only: flips a provider from unapproved -> approved.
  // Order matters: JwtAuthGuard must run first to populate request.user.
  @ApiBearerAuth()
  @ApiOperation({ summary: "[admin] Approve a pending provider" })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @Post("providers/:id/approve")
  async approveProvider(@Param("id") id: string) {
    const user = await this.authService.approveProvider(id);
    if (this.notifications) {
      void this.notifications.sendNotification({
        userId: id,
        title: "Account Approved!",
        body: "Your provider account has been approved. Your listings are now live.",
        type: "PROVIDER_APPROVED",
        data: { type: "PROVIDER_APPROVED", userId: id },
      });
    }
    return user;
  }
}
