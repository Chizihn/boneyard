import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class RefreshDto {
  @ApiProperty({ description: "The refreshToken returned by /auth/login" })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
