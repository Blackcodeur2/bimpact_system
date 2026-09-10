import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccidentClaimStatus, AccidentSeverity } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class ReportAccidentDto {
  @ApiProperty({ example: '2026-09-10T14:30:00Z' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: 'Yaoundé, Carrefour Nlongkak' })
  @IsString()
  @IsNotEmpty()
  location!: string;

  @ApiProperty({ enum: AccidentSeverity, default: AccidentSeverity.MODERATE })
  @IsEnum(AccidentSeverity)
  severity!: AccidentSeverity;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  thirdPartyInvolved?: boolean;

  @ApiPropertyOptional({ example: 'Hôpital Central de Yaoundé' })
  @IsString()
  @IsOptional()
  hospitalName?: string;

  @ApiProperty({ example: 'Accrochage avec un taxi jaune lors d\'un ralentissement.' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ example: 45000 })
  @IsNumber()
  @IsPositive()
  requestedAmount!: number;
}

export class ApproveClaimDto {
  @ApiPropertyOptional({ example: 40000, description: 'Montant approuvé (si différent du montant demandé)' })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  approvedAmount?: number;

  @ApiPropertyOptional({ example: 'Dossier validé après vérification médicale.' })
  @IsString()
  @IsOptional()
  reviewNotes?: string;
}

export class RejectClaimDto {
  @ApiProperty({ example: 'Dossier incomplet — factures manquantes.' })
  @IsString()
  @IsNotEmpty()
  reviewNotes!: string;
}

export class SetInvestigatingDto {
  @ApiPropertyOptional({ example: 'En attente du rapport de police.' })
  @IsString()
  @IsOptional()
  reviewNotes?: string;
}

export class SetSolidarityAmountDto {
  @ApiProperty({ example: 500, description: 'Montant minimum en XAF prélevé sur chaque membre lors d\'un accident validé' })
  @IsNumber()
  @IsPositive()
  amount!: number;
}

export class ListClaimsQueryDto {
  @ApiPropertyOptional({ enum: AccidentClaimStatus })
  @IsEnum(AccidentClaimStatus)
  @IsOptional()
  status?: AccidentClaimStatus;
}
