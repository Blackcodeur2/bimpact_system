import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class PayMaintenanceFeeDto {
  @ApiPropertyOptional({ description: 'Mois concerné au format YYYY-MM (par défaut le mois en cours)', example: '2026-09' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Le mois doit être au format YYYY-MM (ex. 2026-09).' })
  month?: string;
}

export class AdminPayMaintenanceFeeDto {
  @ApiProperty({ description: 'Mois concerné au format YYYY-MM', example: '2026-09' })
  @IsNotEmpty({ message: 'Le mois est obligatoire.' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Le mois doit être au format YYYY-MM (ex. 2026-09).' })
  month!: string;

  @ApiPropertyOptional({ description: 'Source du paiement : WALLET ou MANUAL', default: 'WALLET' })
  @IsOptional()
  @IsIn(['WALLET', 'MANUAL'], { message: 'La source doit être WALLET ou MANUAL.' })
  source?: 'WALLET' | 'MANUAL';

  @ApiPropertyOptional({ description: 'Note ou justificatif facultatif' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
