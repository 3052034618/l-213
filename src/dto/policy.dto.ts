import { IsNotEmpty, IsString, IsNumber, IsDateString, IsOptional, Min } from 'class-validator';

export class CreatePolicyDto {
  @IsNotEmpty()
  @IsString()
  assetNo!: string;

  @IsNotEmpty()
  @IsString()
  insuranceCompany!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  insuranceAmount!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  premium!: number;

  @IsNotEmpty()
  @IsDateString()
  effectiveDate!: string;

  @IsNotEmpty()
  @IsDateString()
  expiryDate!: string;

  @IsOptional()
  @IsString()
  coverageScope?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsNotEmpty()
  @IsString()
  operator!: string;
}

export class QueryPolicyDto {
  @IsOptional()
  @IsString()
  assetNo?: string;

  @IsOptional()
  @IsString()
  policyNo?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  pageSize?: number;
}

export class RenewalQueryDto {
  @IsNotEmpty()
  @IsNumber()
  days!: number;

  @IsOptional()
  @IsString()
  assetType?: string;
}
