import { Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Role } from "@boneyard/skeleton-core";
import type { AuthUser } from "@boneyard/skeleton-core";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PaymentSettlementService } from "./payment-settlement.service";

@ApiTags("payments")
@ApiBearerAuth()
@Controller("payments")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(
    @Inject(PaymentSettlementService) private readonly settlement: PaymentSettlementService
  ) {}

  @ApiOperation({
    summary: "[provider] Create or fetch my Bachs connected account for payouts",
  })
  @Roles(Role.provider)
  @Post("bachs/connect")
  connect(@CurrentUser() user: AuthUser) {
    return this.settlement.ensureConnectedAccount(user.id);
  }
}
