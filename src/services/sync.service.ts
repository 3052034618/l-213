import {
  getDb, nextId, now, SyncRecord, ExternalSystem, AutoRetryPolicy
} from '../config/database';
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

export const SYNC_TYPE_NAMES: Record<SyncType, string> = {
  claim_approved: '理赔审批通过',
  claim_rejected: '理赔审批驳回',
  claim_withdrawn: '理赔申请撤回',
  claim_settled: '理赔已赔付确认',
  policy_renewed: '保单续保完成',
  policy_expiring: '保单到期提醒'
};

export interface RetryDecision {
  shouldRetry: boolean;
  nextRetryAt?: string;
  reason?: string;
}

export class SyncService {
  private getEnabledPolicy(): AutoRetryPolicy | undefined {
    return getDb().data!.autoRetryPolicies.find(p => p.enabled) ||
      getDb().data!.autoRetryPolicies[0];
  }

  private calculateNextRetry(policy: AutoRetryPolicy, retryCount: number): string {
    const base = policy.intervalSeconds;
    let delay = base;
    if (policy.backoffType === 'exponential') {
      delay = base * Math.pow(2, Math.max(0, retryCount - 1));
      delay = Math.min(delay, 3600);
    }
    const d = new Date();
    d.setSeconds(d.getSeconds() + delay);
    return d.toISOString();
  }

  private classifyError(err: any, resp?: { status: number; ok: boolean }): {
    category: string;
    message: string;
    httpStatus?: number;
    retryable: boolean;
  } {
    const policy = this.getEnabledPolicy();
    const whitelist = new Set<string>();
    if (policy) {
      policy.httpErrorWhitelist.split(',').forEach(c => {
        const x = c.trim();
        if (x) whitelist.add(x);
      });
    }

    if (resp) {
      const statusStr = String(resp.status);
      if (resp.status === 401 || resp.status === 403) {
        return {
          category: 'AUTH_FAILED',
          message: `鉴权失败 (HTTP ${resp.status})，请检查 Token 配置`,
          httpStatus: resp.status,
          retryable: false
        };
      }
      if (resp.status === 404) {
        return {
          category: 'ADDRESS_NOT_FOUND',
          message: `目标地址不存在 (HTTP 404)，请检查 Webhook URL 配置`,
          httpStatus: resp.status,
          retryable: false
        };
      }
      if (resp.status === 400 || resp.status >= 400 && resp.status < 500 && !whitelist.has(statusStr)) {
        return {
          category: 'BAD_REQUEST',
          message: `对方拒绝接收 (HTTP ${resp.status})，请检查请求体格式`,
          httpStatus: resp.status,
          retryable: false
        };
      }
      if (!resp.ok || whitelist.has(statusStr) || resp.status >= 500) {
        return {
          category: 'HTTP_ERROR_' + resp.status,
          message: `推送返回非 2xx (HTTP ${resp.status})`,
          httpStatus: resp.status,
          retryable: whitelist.has(statusStr) || resp.status >= 500
        };
      }
    }

    if (err && err.name === 'AbortError') {
      return { category: 'TIMEOUT', message: '请求超时 (10s)，请检查网络或对方服务状态', retryable: true };
    }
    if (err && (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN')) {
      return {
        category: 'NETWORK_ERROR',
        message: `网络异常 (${err.code})：无法连接到目标服务`,
        retryable: true
      };
    }
    return {
      category: 'UNKNOWN',
      message: err?.message || '未知错误',
      retryable: true
    };
  }

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
    if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
      throw new Error(`Webhook URL 必须以 http:// 或 https:// 开头`);
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
    if (updates.webhookUrl && !/^https?:\/\//i.test(updates.webhookUrl)) {
      throw new Error(`Webhook URL 必须以 http:// 或 https:// 开头`);
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

  async testWebhook(systemId: number): Promise<{ success: boolean; httpStatus?: number; durationMs: number; message: string; responseBody?: string }> {
    const db = getDb();
    const system = db.data!.externalSystems.find(s => s.id === systemId);
    if (!system) throw new Error(`外部系统 ${systemId} 不存在`);

    const policy = this.getEnabledPolicy();
    const payload: SyncPayload = {
      syncType: 'policy_expiring',
      businessKey: 'WEBHOOK_TEST_' + Date.now(),
      timestamp: now(),
      data: { action: 'test', message: 'Webhook 连通性测试，请忽略本消息' }
    };

    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Sync-Request-Id': 'TEST-' + start
      };
      if (system.authToken) headers['Authorization'] = `Bearer ${system.authToken}`;

      const resp = await fetch(system.webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const durationMs = Date.now() - start;
      const text = await resp.text().catch(() => '');
      if (resp.ok) {
        return { success: true, httpStatus: resp.status, durationMs, message: '连通性测试成功', responseBody: text };
      }
      const classified = this.classifyError(null, { status: resp.status, ok: false });
      return { success: false, httpStatus: resp.status, durationMs, message: classified.message, responseBody: text };
    } catch (err: any) {
      const durationMs = Date.now() - start;
      const classified = this.classifyError(err);
      return { success: false, durationMs, message: classified.message };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async pushToExternalSystems(syncType: SyncType, businessKey: string, data: any, batchNo?: string): Promise<SyncRecord[]> {
    const db = getDb();
    const enabledSystems = db.data!.externalSystems.filter(s => s.enabled);
    const records: SyncRecord[] = [];
    const policy = this.getEnabledPolicy();

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
        maxRetry: policy?.maxRetry ?? 3,
        retryStrategy: policy ? `${policy.backoffType}/${policy.intervalSeconds}s` : 'none',
        externalAckStatus: 'pending',
        batchNo,
        createdAt: now()
      };
      db.data!.syncRecords.push(record);
      records.push(record);
    }
    await db.write();

    for (let i = 0; i < records.length; i++) {
      this.executeSync(records[i].id).catch(err => logger.error(`异步推送失败: ${err.message}`));
    }
    return records;
  }

  private async executeSync(recordId: number): Promise<SyncRecord> {
    const db = getDb();
    const index = db.data!.syncRecords.findIndex(r => r.id === recordId);
    if (index === -1) throw new Error(`同步记录 ${recordId} 不存在`);

    const record = db.data!.syncRecords[index];
    const system = db.data!.externalSystems.find(s => s.systemCode === record.targetSystem);
    const policy = this.getEnabledPolicy();

    if (!system) {
      record.status = 'failed';
      record.errorCategory = 'SYSTEM_UNCONFIGURED';
      record.errorMessage = `目标系统 ${record.targetSystem} 未配置`;
      record.lastSyncAt = now();
      await db.write();
      return record;
    }

    const requestId = `REQ-${recordId}-${Date.now()}`;
    record.status = 'syncing';
    record.lastSyncAt = now();
    record.lastRequestId = requestId;
    record.lastRequestBody = record.payload;
    await db.write();

    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    let classified: ReturnType<typeof this.classifyError> | null = null;
    let httpStatus: number | undefined;
    let respBody = '';

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Sync-Request-Id': requestId,
        'X-Sync-Type': record.syncType,
        'X-Business-Key': record.businessKey
      };
      if (system.authToken) headers['Authorization'] = `Bearer ${system.authToken}`;

      const resp = await fetch(system.webhookUrl, {
        method: 'POST',
        headers,
        body: record.payload,
        signal: controller.signal
      });
      httpStatus = resp.status;
      respBody = await resp.text().catch(() => '');

      if (resp.ok) {
        record.status = 'success';
        record.httpStatus = resp.status;
        record.lastResponseBody = respBody;
        record.requestDurationMs = Date.now() - start;
        record.nextRetryAt = undefined;
      } else {
        classified = this.classifyError(null, { status: resp.status, ok: false });
        throw new Error(classified.message);
      }
    } catch (err: any) {
      if (!classified) classified = this.classifyError(err);
      record.status = 'failed';
      record.httpStatus = classified.httpStatus || httpStatus;
      record.errorCategory = classified.category;
      record.errorMessage = `${classified.message}${respBody ? ` | 响应体: ${respBody.slice(0, 200)}` : ''}`;
      record.lastResponseBody = respBody;
      record.requestDurationMs = Date.now() - start;
      record.retryCount++;
      if (classified.retryable && record.retryCount < record.maxRetry && policy) {
        record.nextRetryAt = this.calculateNextRetry(policy, record.retryCount);
        record.status = 'waiting_retry';
      } else if (record.retryCount >= record.maxRetry) {
        record.nextRetryAt = undefined;
      }
      logger.warn(`同步失败 [${record.targetSystem}/${record.syncType}] ${classified.category}: ${classified.message} (第${record.retryCount}/${record.maxRetry}次)`);
    } finally {
      clearTimeout(timeoutId);
    }

    await db.write();
    return db.data!.syncRecords[index];
  }

  async retrySync(recordId: number, force?: boolean): Promise<SyncRecord> {
    const db = getDb();
    const record = db.data!.syncRecords.find(r => r.id === recordId);
    if (!record) throw new Error(`同步记录 ${recordId} 不存在`);
    if (!force && record.status === 'success') throw new Error(`记录已是成功状态，无需重试`);
    if (!force && record.retryCount >= record.maxRetry) {
      throw new Error(`已达到最大重试次数 (${record.maxRetry})，如需继续请使用强制重试`);
    }
    return this.executeSync(recordId);
  }

  async retryFailedRecords(): Promise<{ retried: number; success: number; stillFailed: number; skipped: number }> {
    const db = getDb();
    const nowTs = Date.now();
    const candidates = db.data!.syncRecords.filter(r => {
      if (r.status !== 'waiting_retry') return false;
      if (r.retryCount >= r.maxRetry) return false;
      if (r.nextRetryAt && new Date(r.nextRetryAt).getTime() > nowTs) return false;
      return true;
    });
    let success = 0, stillFailed = 0, skipped = 0;
    for (const r of candidates) {
      try {
        const result = await this.executeSync(r.id);
        if (result.status === 'success') success++;
        else stillFailed++;
      } catch { skipped++; }
    }
    return { retried: candidates.length, success, stillFailed, skipped };
  }

  async startAutoRetryScheduler(): Promise<void> {
    const run = async () => {
      try {
        const res = await this.retryFailedRecords();
        if (res.retried > 0) {
          logger.info(`[自动重试] 共处理 ${res.retried} 条：成功 ${res.success}，仍失败 ${res.stillFailed}`);
        }
      } catch (e: any) {
        logger.error(`[自动重试] 执行异常: ${e.message}`);
      }
    };
    setInterval(run, 60_000);
    logger.info('自动重试调度器已启动（每60秒扫描一次）');
  }

  async submitAck(recordId: number, dto: { ackStatus: string; ackResult?: string; ackRemark?: string }): Promise<SyncRecord> {
    const db = getDb();
    const r = db.data!.syncRecords.find(x => x.id === recordId);
    if (!r) throw new Error(`同步记录 ${recordId} 不存在`);
    r.externalAckStatus = dto.ackStatus;
    r.externalAckResult = dto.ackResult;
    r.externalAckRemark = dto.ackRemark;
    r.externalAckTime = now();
    await db.write();
    return r;
  }

  async querySyncRecords(params: {
    businessKey?: string;
    syncType?: SyncType;
    targetSystem?: string;
    status?: string;
    externalAckStatus?: string;
    errorCategory?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: any[]; total: number }> {
    const db = getDb();
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    let filtered = [...db.data!.syncRecords];
    if (params.businessKey) filtered = filtered.filter(r => r.businessKey === params.businessKey);
    if (params.syncType) filtered = filtered.filter(r => r.syncType === params.syncType);
    if (params.targetSystem) filtered = filtered.filter(r => r.targetSystem === params.targetSystem);
    if (params.status) filtered = filtered.filter(r => r.status === params.status);
    if (params.externalAckStatus) filtered = filtered.filter(r => r.externalAckStatus === params.externalAckStatus);
    if (params.errorCategory) filtered = filtered.filter(r => r.errorCategory === params.errorCategory);
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const claimNos = new Set<string>();
    const policyNos = new Set<string>();
    for (const r of filtered) {
      if (r.syncType === 'claim_approved' || r.syncType === 'claim_rejected' || r.syncType === 'claim_withdrawn' || r.syncType === 'claim_settled') claimNos.add(r.businessKey);
      if (r.syncType === 'policy_renewed' || r.syncType === 'policy_expiring') policyNos.add(r.businessKey);
    }
    const claimStatusMap = new Map<string, string>();
    for (const claimNo of claimNos) {
      const c = db.data!.claims.find(x => x.claimNo === claimNo);
      if (c) claimStatusMap.set(claimNo, c.status);
    }
    const policyStatusMap = new Map<string, string>();
    for (const pn of policyNos) {
      const p = db.data!.policies.find(x => x.policyNo === pn);
      if (p) policyStatusMap.set(pn, p.status);
    }
    const enriched = filtered.map(r => {
      const retriesLeft = r.status === 'waiting_retry' ? Math.max(0, (r.maxRetry || 0) - (r.retryCount || 0)) : 0;
      let businessFinalStatus: string | undefined;
      if (r.syncType.startsWith('claim_')) businessFinalStatus = claimStatusMap.get(r.businessKey);
      else if (r.syncType.startsWith('policy_')) businessFinalStatus = policyStatusMap.get(r.businessKey);
      return { ...r, retriesLeft, businessFinalStatus };
    });
    return {
      list: enriched.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length
    };
  }

  async getSyncRecordDetail(id: number): Promise<any | null> {
    const db = getDb();
    const r = db.data!.syncRecords.find(x => x.id === id);
    if (!r) return null;
    const retriesLeft = r.status === 'waiting_retry' ? Math.max(0, (r.maxRetry || 0) - (r.retryCount || 0)) : 0;
    let businessFinalStatus: string | undefined;
    if (r.syncType.startsWith('claim_')) {
      const c = db.data!.claims.find(x => x.claimNo === r.businessKey);
      businessFinalStatus = c?.status;
    } else if (r.syncType.startsWith('policy_')) {
      const p = db.data!.policies.find(x => x.policyNo === r.businessKey);
      businessFinalStatus = p?.status;
    }
    return { ...r, retriesLeft, businessFinalStatus };
  }

  async getSyncStatistics(): Promise<any> {
    const db = getDb();
    const records = db.data!.syncRecords;
    return {
      total: records.length,
      byStatus: {
        success: records.filter(r => r.status === 'success').length,
        failed: records.filter(r => r.status === 'failed').length,
        waiting_retry: records.filter(r => r.status === 'waiting_retry').length,
        syncing: records.filter(r => r.status === 'syncing').length,
        pending: records.filter(r => r.status === 'pending').length,
      },
      byAckStatus: {
        pending: records.filter(r => !r.externalAckStatus || r.externalAckStatus === 'pending').length,
        received: records.filter(r => r.externalAckStatus === 'received').length,
        processed: records.filter(r => r.externalAckStatus === 'processed').length,
        rejected: records.filter(r => r.externalAckStatus === 'rejected').length,
      },
      byType: records.reduce((acc: any, r) => {
        acc[r.syncType] = (acc[r.syncType] || 0) + 1;
        return acc;
      }, {}),
      byErrorCategory: records.filter(r => r.errorCategory).reduce((acc: any, r) => {
        acc[r.errorCategory!] = (acc[r.errorCategory!] || 0) + 1;
        return acc;
      }, {})
    };
  }

  async listRetryPolicies(): Promise<AutoRetryPolicy[]> {
    return getDb().data!.autoRetryPolicies;
  }

  async updateRetryPolicy(id: number, updates: Partial<AutoRetryPolicy>): Promise<AutoRetryPolicy> {
    const db = getDb();
    const idx = db.data!.autoRetryPolicies.findIndex(p => p.id === id);
    if (idx === -1) throw new Error(`重试策略 ${id} 不存在`);
    db.data!.autoRetryPolicies[idx] = {
      ...db.data!.autoRetryPolicies[idx],
      ...updates,
      updatedAt: now()
    };
    await db.write();
    return db.data!.autoRetryPolicies[idx];
  }
}

export const syncService = new SyncService();
