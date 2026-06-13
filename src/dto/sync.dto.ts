import { IsString, IsOptional, IsInt, Min, Max, IsBoolean, IsUrl } from 'class-validator';

export class RegisterExternalSystemDto {
  @IsString()
  systemCode!: string;

  @IsString()
  systemName!: string;

  @IsString()
  systemType!: string;

  @IsString()
  @IsUrl()
  webhookUrl!: string;

  @IsOptional()
  @IsString()
  authToken?: string;
}

export class UpdateExternalSystemDto {
  @IsOptional()
  @IsString()
  systemName?: string;

  @IsOptional()
  @IsString()
  @IsUrl()
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  authToken?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class QuerySyncRecordDto {
  @IsOptional()
  @IsString()
  businessKey?: string;

  @IsOptional()
  @IsString()
  syncType?: string;

  @IsOptional()
  @IsString()
  targetSystem?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class RetrySyncDto {
  @IsOptional()
  @IsInt()
  recordId?: number;
}
