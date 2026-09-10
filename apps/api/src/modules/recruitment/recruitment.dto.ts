import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ApplyJobDto {
  @ApiPropertyOptional({ example: 'Conducteur expérimenté à Yaoundé, disponible immédiatement.' })
  @IsString()
  @IsOptional()
  message?: string;
}
