import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";
import { Role } from "@boneyard/skeleton-core";

export class BroadcastNotificationDto {
  @ApiProperty({ description: "Notification title", example: "Spooky Season Update!" })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({
    description: "Notification body",
    example: "Check out new haunted tours and costume rentals.",
  })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional({
    description: "Target user role: all (if omitted), requester, or provider",
    enum: Role,
  })
  @IsOptional()
  @IsEnum(Role)
  targetRole?: Role;

  @ApiPropertyOptional({
    description: "Target app type: 'hallowear' | 'haint' (optional)",
    example: "haint",
  })
  @IsOptional()
  @IsString()
  appType?: string;

  @ApiPropertyOptional({
    description: "Optional payload/data dictionary",
    example: { screen: "feed", promoId: "halloween-2026" },
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
