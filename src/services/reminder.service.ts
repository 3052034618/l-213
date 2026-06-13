import { getDb, nextId, now, ReminderTask } from '../config/database';
import { policyService } from './policy.service';
import { assetService } from './asset.service';
import { syncService } from './sync.service';
import { logger } from '../utils/logger';

export class ReminderService {
  async createTask(params: {
    taskName: string;
    remindDays: number;
    assetType?: string;
    company?: string;
    cronExpression?: string;
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
      createdAt: now(),
      updatedAt: now()
    };
    db.data!.reminderTasks.push(task);
    await db.write();
    return task;
  }

  async updateTask(id: number, updates: Partial<Omit<ReminderTask, 'id' | 'createdAt'>>): Promise<ReminderTask> {
    const db = getDb();
    const index = db.data!.reminderTasks.findIndex(t => t.id === id);
    if (index === -1) throw new Error(`提醒任务 ${id} 不存在`);
    db.data!.reminderTasks[index] = {
      ...db.data!.reminderTasks[index],
      ...updates,
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

  async listTasks(enabledOnly?: boolean): Promise<ReminderTask[]> {
    let list = [...getDb().data!.reminderTasks];
    if (enabledOnly) list = list.filter(t => t.enabled);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async runTask(taskId: number): Promise<{ task: ReminderTask; count: number; summary: any }> {
    const db = getDb();
    const task = db.data!.reminderTasks.find(t => t.id === taskId);
    if (!task) throw new Error(`提醒任务 ${taskId} 不存在`);

    let policies = await policyService.getExpiringPolicies(task.remindDays);
    if (task.assetType) {
      policies = policies.filter(p => p.asset?.assetType === task.assetType);
    }
    if (task.company) {
      policies = policies.filter(p => p.insuranceCompany === task.company);
    }

    const totalPremium = policies.reduce((s, p) => s + Number(p.premium), 0);
    const totalAmount = policies.reduce((s, p) => s + Number(p.insuranceAmount), 0);

    task.lastRunAt = now();
    const next = new Date();
    next.setDate(next.getDate() + Math.max(1, Math.floor(task.remindDays / 3)));
    task.nextRunAt = next.toISOString();
    task.updatedAt = now();
    await db.write();

    if (policies.length > 0) {
      syncService.pushToExternalSystems('policy_expiring', `TASK-${taskId}`, {
        taskName: task.taskName,
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
      }).catch(() => {});
      logger.info(`提醒任务 [${task.taskName}] 发现 ${policies.length} 份即将到期保单`);
    }

    return {
      task,
      count: policies.length,
      summary: { totalPremium, totalAmount }
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

  async exportRenewalCsv(days: number, assetType?: string): Promise<string> {
    const result = await policyService.generateRenewalList({ days, assetType });
    const headers = ['保单号', '资产编号', '资产名称', '资产类型', '保险公司', '保额', '当期保费', '起保日期', '到期日期', '距到期天数'];
    const lines = [headers.join(',')];

    for (const item of result.list) {
      lines.push([
        item.policyNo,
        item.assetNo,
        `"${item.assetName}"`,
        item.assetType,
        item.insuranceCompany,
        item.insuranceAmount,
        item.currentPremium,
        item.effectiveDate,
        item.expiryDate,
        item.daysToExpiry
      ].join(','));
    }
    lines.push('');
    lines.push(`合计,${result.total}条,,,,,${result.summary.totalPremium},${result.summary.totalAmount},,`);
    return '\uFEFF' + lines.join('\n');
  }
}

export const reminderService = new ReminderService();
