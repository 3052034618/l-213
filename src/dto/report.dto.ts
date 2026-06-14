import { IsString, IsOptional, IsInt, Min, Max, IsDateString, IsBoolean, IsArray, IsEmail } from 'class-validator';

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

  @IsOptional()
  @IsArray()
  receivers?: string[];
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
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  receivers?: string[];
}

export class QueryReminderHistoryDto {
  @IsOptional()
  @IsInt()
  taskId?: number;

  @IsOptional()
  @IsString()
  batchNo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class CreateReceiverDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsArray()
  categories!: string[];
}

export class UpdateReceiverDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsArray()
  categories?: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ExportRenewalDto {
  @IsInt()
  @Min(1)
  days!: number;

  @IsOptional()
  @IsString()
  assetType?: string;

  @IsOptional()
  @IsString()
  batchNo?: string;
}

export class FinanceReportDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
