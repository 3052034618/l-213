import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import * as path from 'path';
import * as fs from 'fs';

export interface Asset {
  id: number;
  assetNo: string;
  assetName: string;
  assetType: string;
  company?: string;
  originalValue: number;
  location?: string;
  description?: string;
  status: string;
  operator?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsurancePolicy {
  id: number;
  policyNo: string;
  assetId: number;
  insuranceCompany: string;
  insuranceAmount: number;
  premium: number;
  effectiveDate: string;
  expiryDate: string;
  coverageScope?: string;
  status: string;
  remarks?: string;
  operator: string;
  createdAt: string;
  updatedAt: string;
  asset?: Asset;
}

export interface ClaimApprovalNode {
  id: number;
  claimId: number;
  step: number;
  stepName: string;
  action: string;
  operator: string;
  operatorRole?: string;
  opinion?: string;
  result: string;
  attachmentUrl?: string;
  createdAt: string;
}

export interface Claim {
  id: number;
  claimNo: string;
  assetId: number;
  policyId: number;
  accidentDate: string;
  accidentDescription: string;
  claimedAmount: number;
  approvedAmount: number;
  status: string;
  adjusterOpinion?: string;
  settlementDate?: string;
  rejectionReason?: string;
  applicant: string;
  approver?: string;
  currentStep?: number;
  supplementNotice?: string;
  confirmedSettlement?: boolean;
  createdAt: string;
  updatedAt: string;
  asset?: Asset;
  policy?: InsurancePolicy;
  materials?: ClaimMaterial[];
  approvalNodes?: ClaimApprovalNode[];
}

export interface ClaimMaterial {
  id: number;
  claimId: number;
  materialType: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  description?: string;
  uploader: string;
  materialName?: string;
  fileUrl?: string;
  remarks?: string;
  createdAt: string;
}

export interface OperationLog {
  id: number;
  module: string;
  operation: string;
  businessKey?: string;
  businessType?: string;
  beforeData?: string;
  afterData?: string;
  operator: string;
  ipAddress?: string;
  remarks?: string;
  action?: string;
  detail?: string;
  createdAt: string;
}

export interface ExternalSystem {
  id: number;
  systemCode: string;
  systemName: string;
  systemType: string;
  webhookUrl: string;
  authToken?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SyncRecord {
  id: number;
  syncType: string;
  businessKey: string;
  payload: string;
  targetSystem: string;
  status: string;
  httpStatus?: number;
  errorCategory?: string;
  errorMessage?: string;
  requestDurationMs?: number;
  retryCount: number;
  maxRetry: number;
  retryStrategy?: string;
  nextRetryAt?: string;
  lastSyncAt?: string;
  lastRequestId?: string;
  lastRequestBody?: string;
  lastResponseBody?: string;
  externalAckStatus?: string;
  externalAckResult?: string;
  externalAckTime?: string;
  externalAckRemark?: string;
  batchNo?: string;
  createdAt: string;
}

export interface AutoRetryPolicy {
  id: number;
  policyName: string;
  maxRetry: number;
  backoffType: 'fixed' | 'exponential';
  intervalSeconds: number;
  httpErrorWhitelist: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderTask {
  id: number;
  taskName: string;
  remindDays: number;
  assetType?: string;
  company?: string;
  cronExpression: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  receivers?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderHistory {
  id: number;
  taskId: number;
  batchNo: string;
  remindDays: number;
  assetType?: string;
  company?: string;
  triggeredCount: number;
  totalPremium: number;
  totalAmount: number;
  receivers?: string;
  assetTypeSummary?: string;
  companySummary?: string;
  createdAt: string;
}

export interface ReminderReceiver {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  department?: string;
  categories: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DatabaseSchema {
  assets: Asset[];
  policies: InsurancePolicy[];
  claims: Claim[];
  materials: ClaimMaterial[];
  claimApprovalNodes: ClaimApprovalNode[];
  logs: OperationLog[];
  externalSystems: ExternalSystem[];
  syncRecords: SyncRecord[];
  autoRetryPolicies: AutoRetryPolicy[];
  reminderTasks: ReminderTask[];
  reminderHistories: ReminderHistory[];
  reminderReceivers: ReminderReceiver[];
  counters: {
    assetId: number;
    policyId: number;
    claimId: number;
    materialId: number;
    approvalNodeId: number;
    logId: number;
    externalSystemId: number;
    syncRecordId: number;
    autoRetryPolicyId: number;
    reminderTaskId: number;
    reminderHistoryId: number;
    reminderReceiverId: number;
  };
}

const defaultData: DatabaseSchema = {
  assets: [],
  policies: [],
  claims: [],
  materials: [],
  claimApprovalNodes: [],
  logs: [],
  externalSystems: [],
  syncRecords: [],
  autoRetryPolicies: [],
  reminderTasks: [],
  reminderHistories: [],
  reminderReceivers: [],
  counters: {
    assetId: 1,
    policyId: 1,
    claimId: 1,
    materialId: 1,
    approvalNodeId: 1,
    logId: 1,
    externalSystemId: 1,
    syncRecordId: 1,
    autoRetryPolicyId: 1,
    reminderTaskId: 1,
    reminderHistoryId: 1,
    reminderReceiverId: 1
  }
};

let db: Low<DatabaseSchema>;

export async function initDatabase(): Promise<void> {
  const dbDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbFile = path.join(dbDir, 'insurance.json');
  const adapter = new JSONFile<DatabaseSchema>(dbFile);
  db = new Low(adapter, defaultData);

  await db.read();

  if (!db.data) {
    db.data = defaultData;
  }

  const d = db.data;
  d.assets ||= []; d.policies ||= []; d.claims ||= []; d.materials ||= [];
  d.claimApprovalNodes ||= []; d.logs ||= []; d.externalSystems ||= [];
  d.syncRecords ||= []; d.autoRetryPolicies ||= [];
  d.reminderTasks ||= []; d.reminderHistories ||= []; d.reminderReceivers ||= [];
  d.counters ||= defaultData.counters;

  if (d.autoRetryPolicies.length === 0) {
    d.autoRetryPolicies.push({
      id: nextId('autoRetryPolicyId'),
      policyName: '默认重试策略',
      maxRetry: 5,
      backoffType: 'exponential',
      intervalSeconds: 30,
      httpErrorWhitelist: '408,429,500,502,503,504',
      enabled: true,
      createdAt: now(),
      updatedAt: now()
    });
  }

  await db.write();
}

export function getDb(): Low<DatabaseSchema> {
  return db;
}

export function nextId(type: keyof DatabaseSchema['counters']): number {
  db.data!.counters[type]++;
  db.write();
  return db.data!.counters[type];
}

export function now(): string {
  return new Date().toISOString();
}
