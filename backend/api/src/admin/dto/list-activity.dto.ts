import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";

const STATUSES = [
  "REQUESTED",
  "MATCHED",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
  "DISPUTED",
  "RESOLVED",
  "CANCELLED",
] as const;

export class ListActivityDto {
  @ApiPropertyOptional({ enum: ["hallowear", "haint"] })
  @IsOptional()
  @IsIn(["hallowear", "haint"])
  vertical?: "hallowear" | "haint";

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
