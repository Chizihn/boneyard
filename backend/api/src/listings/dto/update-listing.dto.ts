import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsObject, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { GeoPointDto } from "../../common/geo-point.dto";

export class UpdateListingDto {
  @ApiPropertyOptional({ example: "Vampire Cape (Deluxe)" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({ description: "Same vertical-specific shape as CreateListingDto.metadata" })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ type: GeoPointDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoPointDto)
  location?: GeoPointDto;

  // Provider's "mark unavailable" action — active=false excludes it from
  // matching's active-listing filter.
  @ApiPropertyOptional({ description: '"Mark unavailable" — excludes it from search/matching' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
