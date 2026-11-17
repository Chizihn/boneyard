import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsIn, IsString, MinLength } from "class-validator";

export class SignupDto {
  @ApiProperty({ example: "requester@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: "password123" })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: "Jane Doe" })
  @IsString()
  @MinLength(1)
  name!: string;

  // Only requester/provider can self-select at signup — AuthService.signup
  // enforces this again server-side (InvalidRoleError for 'admin'), this is
  // just the first line of defense so the request shape itself is sane.
  @ApiProperty({ enum: ["requester", "provider"] })
  @IsIn(["requester", "provider"])
  role!: "requester" | "provider";
}
