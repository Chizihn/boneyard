import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Role } from "@boneyard/skeleton-core";
import type { AuthUser, DisputeStatus, RequestStatus, Vertical } from "@boneyard/skeleton-core";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AdminService } from "./admin.service";
import { ListDisputesDto } from "./dto/list-disputes.dto";
import { ListActivityDto } from "./dto/list-activity.dto";

@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @ApiOperation({ summary: "Providers awaiting approval" })
  @Get("providers/pending")
  pendingProviders() {
    return this.admin.findPendingProviders();
  }

  @ApiOperation({ summary: "Dispute queue, optionally filtered by status" })
  @Get("disputes")
  disputes(@Query() dto: ListDisputesDto) {
    return this.admin.findDisputes(dto.status as DisputeStatus | undefined);
  }

  @ApiOperation({ summary: "Atomically claim an open dispute" })
  @Post("disputes/:id/claim")
  claim(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.claimDispute(id, user.id);
  }

  @ApiOperation({ summary: "Resolve a dispute I've claimed — issues the baseAmount-derived refund" })
  @Post("disputes/:id/resolve")
  resolve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.resolveDispute(id, user.id);
  }

  @ApiOperation({ summary: "Activity feed across both verticals, optionally filtered" })
  @Get("requests")
  activity(@Query() dto: ListActivityDto) {
    return this.admin.findActivity({
      vertical: dto.vertical as Vertical | undefined,
      status: dto.status as RequestStatus | undefined,
    });
  }

  @ApiOperation({
    summary: "Retry a stuck payment settlement (a Bachs transfer that previously failed)",
  })
  @Post("payments/:paymentId/retry-settlement")
  retrySettlement(@Param("paymentId") paymentId: string) {
    return this.admin.retrySettlement(paymentId);
  }
}
