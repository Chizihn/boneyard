import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, MinLength } from "class-validator";

export class CreateRequestDto {
  @ApiProperty({ description: "A listing returned from GET /listings/search" })
  @IsString()
  @MinLength(1)
  listingId!: string;

  @ApiProperty({ example: "2026-10-15T00:00:00.000Z" })
  @IsDateString()
  windowStart!: string;

  @ApiProperty({ example: "2026-10-17T00:00:00.000Z" })
  @IsDateString()
  windowEnd!: string;

  // Hallowear-only eligibility filter, re-checked against the chosen
  // listing the same way the browse/search step would have.
  @ApiPropertyOptional({ description: "Hallowear-only, must match the listing's category", example: "costume" })
  @IsOptional()
  @IsString()
  category?: string;
}
