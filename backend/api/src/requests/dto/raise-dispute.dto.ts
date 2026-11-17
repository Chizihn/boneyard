import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

export class RaiseDisputeDto {
  @ApiPropertyOptional({ example: "Costume arrived damaged" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}
