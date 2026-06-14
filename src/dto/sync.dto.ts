import { IsString, IsOptional, IsInt, Min, Max, IsBoolean, IsIn, Matches } from 'class-validator';

export class RegisterExternalSystemDto {
  @IsString()
  systemCode!: string;

  @IsString()
  systemName!: string;

  @IsString()
  @IsIn(['asset', 'finance', 'hr', 'oa', 'other'])
  systemType!: string;

  @IsString()
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
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  authToken?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

const VALID_SYNC_STATUSES = ['pending', 'syncing', 'success', 'failed', 'waiting_retry'];
const VALID_ACK_STATUSES = ['pending', 'received', 'processed', 'rejected'];
const VALID_SYNC_TYPES = ['claim_approved', 'claim_rejected', 'claim_withdrawn', 'claim_settled', 'policy_renewed', 'policy_expiring'];
const VALID_ERROR_CATEGORIES = ['AUTH_FAILED', 'ADDRESS_NOT_FOUND', 'BAD_REQUEST', 'TIMEOUT', 'NETWORK_ERROR', 'UNKNOWN'];

export class QuerySyncRecordDto {
  @IsOptional()
  @IsString()
  businessKey?: string;

  @IsOptional()
  @IsString()
  @IsIn(VALID_SYNC_TYPES, { message: `syncType 只能是: ${VALID_SYNC_TYPES.join(', ')}` })
  syncType?: string;

  @IsOptional()
  @IsString()
  targetSystem?: string;

  @IsOptional()
  @IsString()
  @IsIn(VALID_SYNC_STATUSES, { message: `status 只能是: ${VALID_SYNC_STATUSES.join(', ')}` })
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(VALID_ACK_STATUSES, { message: `externalAckStatus 只能是: ${VALID_ACK_STATUSES.join(', ')}` })
  externalAckStatus?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(AUTH_FAILED|ADDRESS_NOT_FOUND|BAD_REQUEST|TIMEOUT|NETWORK_ERROR|UNKNOWN|HTTP_ERROR_\d+)$/, {
    message: 'errorCategory 只能是: AUTH_FAILED, ADDRESS_NOT_FOUND, BAD_REQUEST, TIMEOUT, NETWORK_ERROR, UNKNOWN, 或 HTTP_ERROR_XXX (如 HTTP_ERROR_500)'
  })
  errorCategory?: string;

  @IsOptional()
  @IsInt({ message: 'page 必须是正整数' })
  @Min(1, { message: 'page 最小为 1' })
  page?: number;

  @IsOptional()
  @IsInt({ message: 'pageSize 必须是正整数' })
  @Min(1, { message: 'pageSize 最小为 1' })
  @Max(200, { message: 'pageSize 最大为 200' })
  pageSize?: number;
}

export class SubmitAckDto {
  @IsString()
  @IsIn(VALID_ACK_STATUSES, { message: `ackStatus 只能是: ${VALID_ACK_STATUSES.join(', ')}` })
  ackStatus!: string;

  @IsOptional()
  @IsString()
  ackResult?: string;

  @IsOptional()
  @IsString()
  ackRemark?: string;
}

export class RetrySyncDto {
  @IsOptional()
  @IsInt()
  recordId?: number;
}
