import { getDb, nextId, now, OperationLog } from '../config/database';

export class OperationLogService {
  async createLog(
    module: string,
    operation: string,
    businessKey: string,
    operator: string,
    beforeData?: any,
    afterData?: any,
    ipAddress?: string,
    remarks?: string
  ): Promise<OperationLog> {
    const db = getDb();
    const log: OperationLog = {
      id: nextId('logId'),
      module,
      operation,
      businessKey,
      beforeData: beforeData ? JSON.stringify(beforeData) : undefined,
      afterData: afterData ? JSON.stringify(afterData) : undefined,
      operator,
      ipAddress,
      remarks,
      createdAt: now()
    };
    db.data!.logs.push(log);
    await db.write();
    return log;
  }

  async queryLogs(
    module?: string,
    operation?: string,
    businessKey?: string,
    operator?: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ list: OperationLog[]; total: number }> {
    const db = getDb();
    let filtered = [...db.data!.logs];
    
    if (module) filtered = filtered.filter(l => l.module === module);
    if (operation) filtered = filtered.filter(l => l.operation === operation);
    if (businessKey) filtered = filtered.filter(l => l.businessKey === businessKey);
    if (operator) filtered = filtered.filter(l => l.operator === operator);
    
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    const total = filtered.length;
    const list = filtered.slice((page - 1) * pageSize, page * pageSize);
    return { list, total };
  }
}

export const operationLogService = new OperationLogService();
