import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Role } from "@boneyard/skeleton-core";
import type { AuthUser } from "@boneyard/skeleton-core";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequestsService } from "./requests.service";
import { CreateRequestDto } from "./dto/create-request.dto";
import { RaiseDisputeDto } from "./dto/raise-dispute.dto";

@ApiTags("requests")
@ApiBearerAuth()
@Controller("requests")
@UseGuards(JwtAuthGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  // Static-segment routes before the dynamic :id route — same ordering
  // reason as ListingsController.

  @ApiOperation({ summary: "[requester] My bookings" })
  @UseGuards(RolesGuard)
  @Roles(Role.requester)
  @Get("mine")
  findMine(@CurrentUser() user: AuthUser) {
    return this.requests.findMine(user.id);
  }

  @ApiOperation({ summary: "[provider] Incoming requests on my listings" })
  @UseGuards(RolesGuard)
  @Roles(Role.provider)
  @Get("incoming")
  findIncoming(@CurrentUser() user: AuthUser) {
    return this.requests.findIncoming(user.id);
  }

  @ApiOperation({ summary: "Get a request (requester or the owning provider only)" })
  @Get(":id")
  findById(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.requests.findByIdForUser(id, user.id);
  }

  @ApiOperation({
    summary: "[requester] Book a listing — re-validates matching, atomically guards Haint capacity",
  })
  @UseGuards(RolesGuard)
  @Roles(Role.requester)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequestDto) {
    return this.requests.create(user.id, user.email, dto);
  }

  @ApiOperation({ summary: "[provider] Accept a matched request" })
  @UseGuards(RolesGuard)
  @Roles(Role.provider)
  @Post(":id/accept")
  accept(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.requests.accept(id, user.id);
  }

  @ApiOperation({ summary: "[provider] Mark service as started" })
  @UseGuards(RolesGuard)
  @Roles(Role.provider)
  @Post(":id/start")
  start(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.requests.start(id, user.id);
  }

  @ApiOperation({ summary: "[provider] Mark service complete — releases the held payment" })
  @UseGuards(RolesGuard)
  @Roles(Role.provider)
  @Post(":id/complete")
  complete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.requests.complete(id, user.id);
  }

  // Either the requester or the provider who owns the listing may cancel
  // or raise a dispute — enforced in the service (assertIsPartyToRequest),
  // not role-restricted here.
  @ApiOperation({ summary: "Cancel before acceptance — fully refunds the held payment" })
  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.requests.cancel(id, user.id);
  }

  @ApiOperation({ summary: "Raise a dispute while service is in progress" })
  @Post(":id/dispute")
  raiseDispute(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: RaiseDisputeDto
  ) {
    return this.requests.raiseDispute(id, user.id, dto.reason);
  }
}
