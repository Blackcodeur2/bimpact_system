import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Atelier mécanique et vente de pièces motos' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'Mécanique & Commerce' })
  @IsString()
  @IsNotEmpty()
  sector!: string;

  @ApiProperty({ example: 'Yaoundé' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiPropertyOptional({ example: 'Carrefour Emombo' })
  @IsString()
  @IsOptional()
  locationDetail?: string;

  @ApiProperty({ example: 1500000 })
  @IsNumber()
  @IsPositive()
  estimatedBudget!: number;

  @ApiPropertyOptional({ example: 300000 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  personalContribution?: number;

  @ApiProperty({ example: 1200000 })
  @IsNumber()
  @IsPositive()
  grantRequested!: number;

  @ApiProperty({ example: 'Description détaillée du projet et des débouchés attendus.' })
  @IsString()
  @IsNotEmpty()
  description!: string;
}
