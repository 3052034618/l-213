import { Request, Response } from 'express';
import { operationLogService } from '../services/operationLog.service';

export class OperationLogController {
  async getLogs(req: Request, res: Response) {
    try {
      const { module, operation, businessKey, operator } = req.query;
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 20;
      
      const result = await operationLogService.queryLogs(
        module as string,
        operation as string,
        businessKey as string,
        operator as string,
        page,
        pageSize
      );
      
      res.json({
        code: 200,
        message: '查询成功',
        data: result.list,
        total: result.total,
        page,
        pageSize
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }
}

export const operationLogController = new OperationLogController();
