import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class UnregisterDeviceDto {
  @ApiProperty({
    description: "Expo push token to unregister/deactivate",
    example: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
