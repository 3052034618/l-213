import {
  getDb, nextId, now, ReminderTask, ReminderHistory, ReminderReceiver
} from '../config/database';
import { policyService } from './policy.service';
import { assetService } from './asset.service';
import { syncService } from './sync.service';
import { logger } from '../utils/logger';

function genBatchNo(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}-${rand}`;
}

export class ReminderService {
  async createTask(params: {
    taskName: string;
    remindDays: number;
    assetType?: string;
    company?: string;
    cronExpression?: string;
    receivers?: string[];
  }): Promise<ReminderTask> {
    const db = getDb();
    const task: ReminderTask = {
      id: nextId('reminderTaskId'),
      taskName: params.taskName,
      remindDays: params.remindDays,
      assetType: params.assetType,
      company: params.company,
      cronExpression: params.cronExpression || `0 9 */${Math.max(1, Math.floor(params.remindDays / 3))} * *`,
      enabled: true,
      receivers: params.receivers ? JSON.stringify(params.receivers) : undefined,
      createdAt: now(),
      updatedAt: now()
    };
    db.data!.reminderTasks.push(task);
    await db.write();
    return task;
  }

  async updateTask(id: number, updates: any): Promise<ReminderTask> {
    const db = getDb();
    const index = db.data!.reminderTasks.findIndex(t => t.id === id);
    if (index === -1) throw new Error(`提醒任务 ${id} 不存在`);
    const toStore: any = { ...updates };
    if (updates.receivers && Array.isArray(updates.receivers)) {
      toStore.receivers = JSON.stringify(updates.receivers);
    }
    db.data!.reminderTasks[index] = {
      ...db.data!.reminderTasks[index],
      ...toStore,
      updatedAt: now()
    };
    await db.write();
    return db.data!.reminderTasks[index];
  }

  async deleteTask(id: number): Promise<void> {
    const db = getDb();
    const index = db.data!.reminderTasks.findIndex(t => t.id === id);
    if (index === -1) throw new Error(`提醒任务 ${id} 不存在`);
    db.data!.reminderTasks.splice(index, 1);
    await db.write();
  }

  async listTasks(enabledOnly?: boolean): Promise<(ReminderTask & { receiverList?: string[]; lastHistory?: ReminderHistory })[]> {
    const db = getDb();
    let list = [...db.data!.reminderTasks];
    if (enabledOnly) list = list.filter(t => t.enabled);
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list.map(t => {
      let receiverList: string[] | undefined;
      try { receiverList = t.receivers ? JSON.parse(t.receivers) : undefined; } catch {}
      const lastHistory = [...db.data!.reminderHistories]
        .filter(h => h.taskId === t.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      return { ...t, receiverList, lastHistory };
    });
  }

  async runTask(taskId: number): Promise<{
    task: ReminderTask;
    batchNo: string;
    count: number;
    totalPremium: number;
    totalAmount: number;
    policies: any[];
  }> {
    const db = getDb();
    const task = db.data!.reminderTasks.find(t => t.id === taskId);
    if (!task) throw new Error(`提醒任务 ${taskId} 不存在`);

    let policies = await policyService.getExpiringPolicies(task.remindDays);
    if (task.assetType) {
      policies = policies.filter(p => p.asset?.assetType === task.assetType);
    }
    if (task.company) {
      policies = policies.filter(p => p.asset?.company === task.company);
    }

    const totalPremium = policies.reduce((s, p) => s + Number(p.premium), 0);
    const totalAmount = policies.reduce((s, p) => s + Number(p.insuranceAmount), 0);
    const batchNo = genBatchNo('RMD');

    const byCompany = new Map<string, number>();
    const byAssetType = new Map<string, number>();
    for (const p of policies) {
      const assetCompany = p.asset?.company || '（未归属）';
      byCompany.set(assetCompany, (byCompany.get(assetCompany) || 0) + 1);
      if (p.asset?.assetType) {
        byAssetType.set(p.asset.assetType, (byAssetType.get(p.asset.assetType) || 0) + 1);
      }
    }

    const history: ReminderHistory = {
      id: nextId('reminderHistoryId'),
      taskId: task.id,
      batchNo,
      remindDays: task.remindDays,
      assetType: task.assetType,
      company: task.company,
      triggeredCount: policies.length,
      totalPremium,
      totalAmount,
      receivers: task.receivers,
      assetTypeSummary: JSON.stringify(Object.fromEntries(byAssetType.entries())),
      companySummary: JSON.stringify(Object.fromEntries(byCompany.entries())),
      createdAt: now()
    };
    db.data!.reminderHistories.push(history);

    task.lastRunAt = now();
    const next = new Date();
    next.setDate(next.getDate() + Math.max(1, Math.floor(task.remindDays / 3)));
    task.nextRunAt = next.toISOString();
    task.updatedAt = now();
    await db.write();

    if (policies.length > 0) {
      syncService.pushToExternalSystems('policy_expiring', `BATCH-${batchNo}`, {
        taskName: task.taskName,
        taskId: task.id,
        batchNo,
        remindDays: task.remindDays,
        count: policies.length,
        totalPremium,
        totalAmount,
        policies: policies.map(p => ({
          policyNo: p.policyNo,
          assetNo: p.asset?.assetNo,
          assetName: p.asset?.assetName,
          expiryDate: p.expiryDate
        }))
      }, batchNo).catch(() => {});
      logger.info(`提醒任务 [${task.taskName}] 批次 ${batchNo} 发现 ${policies.length} 份即将到期保单`);
    }

    return {
      task,
      batchNo,
      count: policies.length,
      totalPremium,
      totalAmount,
      policies
    };
  }

  async runAllDueTasks(): Promise<{ executed: number; totalFound: number }> {
    const tasks = await this.listTasks(true);
    let executed = 0;
    let totalFound = 0;
    for (const t of tasks) {
      if (!t.lastRunAt || new Date(t.lastRunAt) < new Date(Date.now() - 12 * 3600 * 1000)) {
        const result = await this.runTask(t.id);
        executed++;
        totalFound += result.count;
      }
    }
    return { executed, totalFound };
  }

  async listHistories(params: {
    taskId?: number;
    batchNo?: string;
    company?: string;
    assetType?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    list: (ReminderHistory & { companyDetails?: Record<string, number>; assetTypeDetails?: Record<string, number>; receiverList?: string[] })[];
    total: number;
  }> {
    const db = getDb();
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    let filtered = [...db.data!.reminderHistories];
    if (params.taskId) filtered = filtered.filter(h => h.taskId === params.taskId);
    if (params.batchNo) filtered = filtered.filter(h => h.batchNo === params.batchNo);
    if (params.company) filtered = filtered.filter(h => {
      if (h.company === params.company) return true;
      try {
        const map = h.companySummary ? JSON.parse(h.companySummary) as Record<string, number> : {};
        return Object.prototype.hasOwnProperty.call(map, params.company!);
      } catch { return false; }
    });
    if (params.assetType) filtered = filtered.filter(h => {
      if (h.assetType === params.assetType) return true;
      try {
        const map = h.assetTypeSummary ? JSON.parse(h.assetTypeSummary) as Record<string, number> : {};
        return Object.prototype.hasOwnProperty.call(map, params.assetType!);
      } catch { return false; }
    });
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const list = filtered.slice((page - 1) * pageSize, page * pageSize).map(h => {
      let companyDetails: Record<string, number> | undefined;
      let assetTypeDetails: Record<string, number> | undefined;
      let receiverList: string[] | undefined;
      try { companyDetails = h.companySummary ? JSON.parse(h.companySummary) : undefined; } catch {}
      try { assetTypeDetails = h.assetTypeSummary ? JSON.parse(h.assetTypeSummary) : undefined; } catch {}
      try { receiverList = h.receivers ? JSON.parse(h.receivers) : undefined; } catch {}
      return { ...h, companyDetails, assetTypeDetails, receiverList };
    });
    return { list, total: filtered.length };
  }

  async createReceiver(params: {
    name: string;
    email?: string;
    phone?: string;
    department?: string;
    categories: string[];
  }): Promise<ReminderReceiver> {
    const db = getDb();
    const r: ReminderReceiver = {
      id: nextId('reminderReceiverId'),
      name: params.name,
      email: params.email,
      phone: params.phone,
      department: params.department,
      categories: JSON.stringify(params.categories),
      enabled: true,
      createdAt: now(),
      updatedAt: now()
    };
    db.data!.reminderReceivers.push(r);
    await db.write();
    return r;
  }

  async updateReceiver(id: number, updates: any): Promise<ReminderReceiver> {
    const db = getDb();
    const idx = db.data!.reminderReceivers.findIndex(r => r.id === id);
    if (idx === -1) throw new Error(`接收对象 ${id} 不存在`);
    const toStore: any = { ...updates };
    if (updates.categories && Array.isArray(updates.categories)) {
      toStore.categories = JSON.stringify(updates.categories);
    }
    db.data!.reminderReceivers[idx] = {
      ...db.data!.reminderReceivers[idx],
      ...toStore,
      updatedAt: now()
    };
    await db.write();
    return db.data!.reminderReceivers[idx];
  }

  async deleteReceiver(id: number): Promise<void> {
    const db = getDb();
    const idx = db.data!.reminderReceivers.findIndex(r => r.id === id);
    if (idx === -1) throw new Error(`接收对象 ${id} 不存在`);
    db.data!.reminderReceivers.splice(idx, 1);
    await db.write();
  }

  async listReceivers(category?: string): Promise<(ReminderReceiver & { categoryList?: string[] })[]> {
    const db = getDb();
    let list = [...db.data!.reminderReceivers];
    if (category) list = list.filter(r => {
      try { return (JSON.parse(r.categories) as string[]).includes(category); } catch { return false; }
    });
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list.map(r => {
      let categoryList: string[] | undefined;
      try { categoryList = JSON.parse(r.categories); } catch {}
      return { ...r, categoryList };
    });
  }

  async exportRenewalCsv(days: number, assetType?: string, batchNo?: string): Promise<string> {
    const result = await policyService.generateRenewalList({ days, assetType });
    const finalBatchNo = batchNo || genBatchNo('XBL');
    const headers = ['批次号', '保单号', '资产编号', '资产名称', '资产类型', '所属公司', '保险公司', '保额', '当期保费', '起保日期', '到期日期', '距到期天数', '联系建议'];
    const lines = ['\uFEFF续保清单', `批次号:,${finalBatchNo},,,,,,,,,导出时间:,${now()}`];
    lines.push(headers.join(','));

    for (const item of result.list) {
      const suggest = item.daysToExpiry <= 7 ? '加急联系财务续保' :
                       item.daysToExpiry <= 30 ? '尽快发送续保申请' :
                       item.daysToExpiry <= 90 ? '提前准备续保材料' : '正常跟进';
      lines.push([
        finalBatchNo,
        item.policyNo,
        item.assetNo,
        `"${item.assetName}"`,
        item.assetType,
        `"${item.company || ''}"`,
        item.insuranceCompany,
        item.insuranceAmount,
        item.currentPremium,
        item.effectiveDate,
        item.expiryDate,
        item.daysToExpiry,
        suggest
      ].join(','));
    }
    lines.push('');
    lines.push(`合计,${result.total}条,,,,,,,,${result.summary.totalPremium}（总保费）,${result.summary.totalAmount}（总保额）,,`);
    return lines.join('\n');
  }
}

export const reminderService = new ReminderService();
