import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsObject, IsString, MinLength, ValidateNested } from "class-validator";
import { GeoPointDto } from "../../common/geo-point.dto";

export class CreateListingDto {
  @ApiProperty({ example: "Vampire Cape" })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ enum: ["hallowear", "haint"] })
  @IsIn(["hallowear", "haint"])
  vertical!: "hallowear" | "haint";

  // Vertical-specific shape (category/availability/price for Hallowear,
  // slot/capacity/rating for Haint) — validated by the matching strategies
  // at search time (malformed metadata parses to ineligible, not an error),
  // not re-validated here.
  @ApiProperty({
    description:
      "Hallowear: { category, availabilityStart, availabilityEnd, pricePerDay }. " +
      "Haint: { slotStart, slotEnd, capacity, bookedCount, rating, pricePerTicket }.",
    example: {
      category: "costume",
      availabilityStart: "2026-10-01T00:00:00.000Z",
      availabilityEnd: "2026-11-30T00:00:00.000Z",
      pricePerDay: 20,
    },
  })
  @IsObject()
  metadata!: Record<string, unknown>;

  @ApiProperty({ type: GeoPointDto })
  @ValidateNested()
  @Type(() => GeoPointDto)
  location!: GeoPointDto;
}
