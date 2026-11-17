import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

export class RegisterDeviceDto {
  @ApiProperty({
    description: "Expo push token, e.g. ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    example: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^Expo(nent)?PushToken\[.+\]$/, {
    message: "token must be a valid Expo push token (e.g. ExponentPushToken[...])",
  })
  token!: string;

  @ApiPropertyOptional({
    description: "Device platform (ios, android, web)",
    example: "ios",
  })
  @IsString()
  @IsOptional()
  platform?: string;

  @ApiPropertyOptional({
    description: "Which app registered this token (e.g. 'hallowear' | 'haint')",
    example: "hallowear",
  })
  @IsString()
  @IsOptional()
  appType?: string;

  @ApiPropertyOptional({
    description: "Unique client device identifier if available",
    example: "device-uuid-1234",
  })
  @IsString()
  @IsOptional()
  deviceId?: string;
}
