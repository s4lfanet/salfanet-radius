import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'superadmin', description: 'Admin username' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ example: 'admin123', description: 'Admin password' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class TwoFactorVerifyDto {
  @ApiProperty({ description: '2FA pending token from login step 1' })
  @IsString()
  @IsNotEmpty()
  tfaToken!: string;

  @ApiProperty({ example: '123456', description: '6-digit TOTP code' })
  @IsString()
  @IsNotEmpty()
  tfaCode!: string;
}

export class AgentLoginDto {
  @ApiProperty({ example: '628123456789', description: 'Agent phone number' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({ description: 'OTP code (if required)' })
  @IsString()
  @IsOptional()
  otp?: string;
}

export class TechnicianLoginDto {
  @ApiProperty({ example: 'tech01', description: 'Technician username' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ example: 'password', description: 'Technician password' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
