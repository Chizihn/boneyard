import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";

export class ListDisputesDto {
  @ApiPropertyOptional({ enum: ["open", "resolved"] })
  @IsOptional()
  @IsIn(["open", "resolved"])
  status?: "open" | "resolved";
}
