import { IsBoolean, IsOptional, Matches } from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class PayContributionDto {
  /** Jour couvert (AAAA-MM-JJ, heure du Cameroun). Par défaut : aujourd'hui. */
  @IsOptional()
  @Matches(CALENDAR_DATE, { message: 'Date au format AAAA-MM-JJ.' })
  periodDate?: string;
}

export class ContributionSettingsDto {
  @IsBoolean()
  autoDebit: boolean;
}

export class AdminContributionsQueryDto extends CursorQueryDto {
  @IsOptional()
  @Matches(CALENDAR_DATE, { message: 'Date au format AAAA-MM-JJ.' })
  date?: string;
}
