import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import * as path from 'path';
import * as fs from 'fs';

export interface Asset {
  id: number;
  assetNo: string;
  assetName: string;
  assetType: string;
  originalValue: number;
  location?: string;
  description?: string;
  status: string;
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
  retryCount: number;
  maxRetry: number;
  errorMessage?: string;
  responseBody?: string;
  lastSyncAt?: string;
  createdAt: string;
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
  reminderTasks: ReminderTask[];
  counters: {
    assetId: number;
    policyId: number;
    claimId: number;
    materialId: number;
    approvalNodeId: number;
    logId: number;
    externalSystemId: number;
    syncRecordId: number;
    reminderTaskId: number;
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
  reminderTasks: [],
  counters: {
    assetId: 0,
    policyId: 0,
    claimId: 0,
    materialId: 0,
    approvalNodeId: 0,
    logId: 0,
    externalSystemId: 0,
    syncRecordId: 0,
    reminderTaskId: 0
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

  if (!db.data.counters) {
    db.data.counters = defaultData.counters;
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
