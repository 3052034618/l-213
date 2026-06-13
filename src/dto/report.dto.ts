import { IsString, IsOptional, IsInt, Min, Max, IsDateString } from 'class-validator';

export class CreateReminderTaskDto {
  @IsString()
  taskName!: string;

  @IsInt()
  @Min(1)
  @Max(365)
  remindDays!: number;

  @IsOptional()
  @IsString()
  assetType?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  cronExpression?: string;
}

export class UpdateReminderTaskDto {
  @IsOptional()
  @IsString()
  taskName?: string;

  @IsOptional()
  @IsInt()
  remindDays?: number;

  @IsOptional()
  @IsString()
  assetType?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  cronExpression?: string;

  @IsOptional()
  enabled?: boolean;
}

export class ExportRenewalDto {
  @IsInt()
  @Min(1)
  days!: number;

  @IsOptional()
  @IsString()
  assetType?: string;
}

export class FinanceReportDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
