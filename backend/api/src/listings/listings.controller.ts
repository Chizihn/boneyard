import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Role } from "@boneyard/skeleton-core";
import type { AuthUser } from "@boneyard/skeleton-core";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ListingsService } from "./listings.service";
import { CreateListingDto } from "./dto/create-listing.dto";
import { UpdateListingDto } from "./dto/update-listing.dto";
import { SearchListingsDto } from "./dto/search-listings.dto";

@ApiTags("listings")
@ApiBearerAuth()
@Controller("listings")
@UseGuards(JwtAuthGuard)
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  // Static-segment routes (search, mine) must be declared before the
  // dynamic :id route below, or Express's router would greedily match
  // "search"/"mine" as an :id value.

  @ApiOperation({ summary: "Browse: runs the matching engine, returns ranked eligible listings" })
  @Get("search")
  search(@Query() dto: SearchListingsDto) {
    return this.listings.search(dto);
  }

  @ApiOperation({ summary: "[provider] List my own listings" })
  @UseGuards(RolesGuard)
  @Roles(Role.provider)
  @Get("mine")
  findMine(@CurrentUser() user: AuthUser) {
    return this.listings.findMine(user.id);
  }

  @ApiOperation({ summary: "Get a single listing" })
  @Get(":id")
  findById(@Param("id") id: string) {
    return this.listings.findById(id);
  }

  @ApiOperation({ summary: "[provider] Create a listing" })
  @UseGuards(RolesGuard)
  @Roles(Role.provider)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateListingDto) {
    return this.listings.create(user.id, dto);
  }

  @ApiOperation({ summary: "[provider] Edit or deactivate my own listing" })
  @UseGuards(RolesGuard)
  @Roles(Role.provider)
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateListingDto
  ) {
    return this.listings.update(id, user.id, dto);
  }
}
