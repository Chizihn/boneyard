import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class SearchListingsDto {
  @ApiProperty({ enum: ["hallowear", "haint"] })
  @IsIn(["hallowear", "haint"])
  vertical!: "hallowear" | "haint";

  @ApiProperty({ example: "2026-10-15T00:00:00.000Z" })
  @IsDateString()
  windowStart!: string;

  @ApiProperty({ example: "2026-10-17T00:00:00.000Z" })
  @IsDateString()
  windowEnd!: string;

  @ApiProperty({ minimum: -90, maximum: 90, example: 37.78 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat!: number;

  @ApiProperty({ minimum: -180, maximum: 180, example: -122.42 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng!: number;

  // Hallowear-only filter (costume/prop category). Haint eligibility is
  // purely window+capacity based, so this is simply ignored for that
  // vertical rather than rejected.
  @ApiPropertyOptional({ description: "Hallowear-only filter; ignored for Haint", example: "costume" })
  @IsOptional()
  @IsString()
  category?: string;
}
