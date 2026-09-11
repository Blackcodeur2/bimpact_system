import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class QuizAnswerDto {
  @IsUUID()
  questionId: string;

  @IsInt()
  @Min(0)
  @Max(20)
  selectedIndex: number;
}

export class SubmitQuizDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers: QuizAnswerDto[];
}

export class LessonProgressDto {
  @IsInt()
  @Min(0)
  @Max(86_400)
  positionSeconds: number;

  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent: number;
}
