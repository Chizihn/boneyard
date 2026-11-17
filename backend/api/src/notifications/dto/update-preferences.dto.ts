import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ description: "Enable or disable push notifications" })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({ description: "Enable or disable order/booking updates" })
  @IsOptional()
  @IsBoolean()
  orderUpdates?: boolean;

  @ApiPropertyOptional({ description: "Enable or disable marketing/promotional notifications" })
  @IsOptional()
  @IsBoolean()
  marketing?: boolean;
}
