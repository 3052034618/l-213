import { getDb, nextId, now, SyncRecord, ExternalSystem } from '../config/database';
import { logger } from '../utils/logger';

export type SyncType =
  | 'claim_approved'
  | 'claim_rejected'
  | 'claim_withdrawn'
  | 'claim_settled'
  | 'policy_renewed'
  | 'policy_expiring';

export interface SyncPayload {
  syncType: SyncType;
  businessKey: string;
  timestamp: string;
  data: any;
}

export class SyncService {
  async registerExternalSystem(
    systemCode: string,
    systemName: string,
    systemType: string,
    webhookUrl: string,
    authToken?: string
  ): Promise<ExternalSystem> {
    const db = getDb();
    const existing = db.data!.externalSystems.find(s => s.systemCode === systemCode);
    if (existing) {
      throw new Error(`系统编码 ${systemCode} 已存在`);
    }
    const system: ExternalSystem = {
      id: nextId('externalSystemId'),
      systemCode,
      systemName,
      systemType,
      webhookUrl,
      authToken,
      enabled: true,
      createdAt: now(),
      updatedAt: now()
    };
    db.data!.externalSystems.push(system);
    await db.write();
    return system;
  }

  async updateExternalSystem(
    id: number,
    updates: Partial<Pick<ExternalSystem, 'systemName' | 'webhookUrl' | 'authToken' | 'enabled'>>
  ): Promise<ExternalSystem> {
    const db = getDb();
    const index = db.data!.externalSystems.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error(`外部系统 ${id} 不存在`);
    }
    db.data!.externalSystems[index] = {
      ...db.data!.externalSystems[index],
      ...updates,
      updatedAt: now()
    };
    await db.write();
    return db.data!.externalSystems[index];
  }

  async listExternalSystems(): Promise<ExternalSystem[]> {
    return getDb().data!.externalSystems;
  }

  async pushToExternalSystems(syncType: SyncType, businessKey: string, data: any): Promise<SyncRecord[]> {
    const db = getDb();
    const enabledSystems = db.data!.externalSystems.filter(s => s.enabled);
    const records: SyncRecord[] = [];

    for (const system of enabledSystems) {
      const payload: SyncPayload = {
        syncType,
        businessKey,
        timestamp: now(),
        data
      };

      const record: SyncRecord = {
        id: nextId('syncRecordId'),
        syncType,
        businessKey,
        payload: JSON.stringify(payload),
        targetSystem: system.systemCode,
        status: 'pending',
        retryCount: 0,
        maxRetry: 3,
        createdAt: now()
      };
      db.data!.syncRecords.push(record);
      records.push(record);
    }
    await db.write();

    for (let i = 0; i < records.length; i++) {
      await this.executeSync(records[i].id);
    }

    return records;
  }

  private async executeSync(recordId: number): Promise<SyncRecord> {
    const db = getDb();
    const index = db.data!.syncRecords.findIndex(r => r.id === recordId);
    if (index === -1) {
      throw new Error(`同步记录 ${recordId} 不存在`);
    }

    const record = db.data!.syncRecords[index];
    const system = db.data!.externalSystems.find(s => s.systemCode === record.targetSystem);
    if (!system) {
      record.status = 'failed';
      record.errorMessage = `目标系统 ${record.targetSystem} 未配置`;
      record.lastSyncAt = now();
      await db.write();
      return record;
    }

    try {
      record.status = 'syncing';
      record.lastSyncAt = now();
      await db.write();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (system.authToken) {
        headers['Authorization'] = `Bearer ${system.authToken}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      let respBody = '';
      let ok = false;

      try {
        const mockSuccess = true;
        if (mockSuccess) {
          ok = true;
          respBody = JSON.stringify({ code: 200, message: '模拟推送成功', system: system.systemCode });
        }
      } finally {
        clearTimeout(timeoutId);
      }

      if (ok) {
        record.status = 'success';
        record.responseBody = respBody;
      } else {
        record.status = 'failed';
        record.retryCount++;
        record.errorMessage = `推送失败: ${respBody || '未知错误'}`;
      }
    } catch (err: any) {
      record.status = 'failed';
      record.retryCount++;
      record.errorMessage = err?.message || '网络异常';
      logger.warn(`同步失败 [${record.targetSystem}] ${record.syncType}: ${record.errorMessage}`);
    }

    await db.write();
    return db.data!.syncRecords[index];
  }

  async retrySync(recordId: number): Promise<SyncRecord> {
    const db = getDb();
    const record = db.data!.syncRecords.find(r => r.id === recordId);
    if (!record) {
      throw new Error(`同步记录 ${recordId} 不存在`);
    }
    if (record.retryCount >= record.maxRetry) {
      throw new Error(`已达到最大重试次数 (${record.maxRetry})`);
    }
    return this.executeSync(recordId);
  }

  async retryFailedRecords(): Promise<{ retried: number; failed: number }> {
    const db = getDb();
    const failed = db.data!.syncRecords.filter(
      r => r.status === 'failed' && r.retryCount < r.maxRetry
    );
    let retried = 0;
    let stillFailed = 0;
    for (const r of failed) {
      const result = await this.executeSync(r.id);
      if (result.status === 'success') retried++;
      else stillFailed++;
    }
    return { retried, failed: stillFailed };
  }

  async querySyncRecords(params: {
    businessKey?: string;
    syncType?: SyncType;
    targetSystem?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: SyncRecord[]; total: number }> {
    const db = getDb();
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;

    let filtered = [...db.data!.syncRecords];
    if (params.businessKey) filtered = filtered.filter(r => r.businessKey === params.businessKey);
    if (params.syncType) filtered = filtered.filter(r => r.syncType === params.syncType);
    if (params.targetSystem) filtered = filtered.filter(r => r.targetSystem === params.targetSystem);
    if (params.status) filtered = filtered.filter(r => r.status === params.status);

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      list: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length
    };
  }

  async getSyncStatistics(): Promise<any> {
    const db = getDb();
    const records = db.data!.syncRecords;
    return {
      total: records.length,
      success: records.filter(r => r.status === 'success').length,
      failed: records.filter(r => r.status === 'failed').length,
      pending: records.filter(r => r.status === 'pending' || r.status === 'syncing').length,
      byType: records.reduce((acc: any, r) => {
        acc[r.syncType] = (acc[r.syncType] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

export const syncService = new SyncService();
