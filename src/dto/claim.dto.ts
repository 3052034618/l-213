import { IsNotEmpty, IsString, IsNumber, IsDateString, IsOptional, Min } from 'class-validator';

export class CreateClaimDto {
  @IsNotEmpty()
  @IsString()
  assetNo!: string;

  @IsOptional()
  @IsString()
  policyNo?: string;

  @IsNotEmpty()
  @IsDateString()
  accidentDate!: string;

  @IsNotEmpty()
  @IsString()
  accidentDescription!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  claimedAmount!: number;

  @IsNotEmpty()
  @IsString()
  applicant!: string;
}

export class QueryClaimDto {
  @IsOptional()
  @IsString()
  assetNo?: string;

  @IsOptional()
  @IsString()
  claimNo?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  currentStep?: number;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  pageSize?: number;
}

export class ReviewOpinionDto {
  @IsNotEmpty()
  @IsString()
  operator!: string;

  @IsOptional()
  @IsString()
  opinion?: string;
}

export class SupplementNoticeDto {
  @IsNotEmpty()
  @IsString()
  operator!: string;

  @IsNotEmpty()
  @IsString()
  notice!: string;
}

export class ResubmitClaimDto {
  @IsNotEmpty()
  @IsString()
  operator!: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class ConfirmSettlementDto {
  @IsNotEmpty()
  @IsString()
  operator!: string;

  @IsOptional()
  @IsDateString()
  settlementDate?: string;
}

export class ApproveClaimDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  approvedAmount!: number;

  @IsOptional()
  @IsString()
  adjusterOpinion?: string;

  @IsOptional()
  @IsDateString()
  settlementDate?: string;

  @IsNotEmpty()
  @IsString()
  approver!: string;
}

export class RejectClaimDto {
  @IsNotEmpty()
  @IsString()
  rejectionReason!: string;

  @IsNotEmpty()
  @IsString()
  approver!: string;
}

export class UploadMaterialDto {
  @IsNotEmpty()
  @IsString()
  claimNo!: string;

  @IsNotEmpty()
  @IsString()
  materialType!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsString()
  uploader!: string;
}
