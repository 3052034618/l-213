import { Request, Response, NextFunction } from 'express';
import { operationLogService } from '../services/operationLog.service';

export interface LogConfig {
  module: string;
  operation: string;
  getBusinessKey?: (req: Request) => string;
  getOperator?: (req: Request) => string;
}

export const createOperationLog = (config: LogConfig) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    let responseBody: any;

    res.send = function (body: any) {
      responseBody = body;
      return originalSend.call(this, body);
    };

    res.on('finish', async () => {
      try {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const businessKey = config.getBusinessKey ? config.getBusinessKey(req) : req.params.id || '';
          const operator = config.getOperator ? config.getOperator(req) : req.body?.operator || req.body?.applicant || req.body?.uploader || req.body?.approver || 'system';
          const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || req.socket.remoteAddress;
          
          let beforeData = req.body;
          let afterData = responseBody;
          
          if (beforeData && JSON.stringify(beforeData).length > 1000) {
            beforeData = { truncated: true, summary: '请求数据过大，已截断' };
          }
          if (afterData && typeof afterData === 'string' && afterData.length > 1000) {
            try {
              const parsed = JSON.parse(afterData);
              if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 10) {
                afterData = { 
                  truncated: true, 
                  summary: `包含${parsed.data.length}条记录的列表数据`,
                  total: parsed.total
                };
              } else {
                afterData = { truncated: true, summary: '响应数据过大，已截断' };
              }
            } catch {
              afterData = { truncated: true, summary: '响应数据过大，已截断' };
            }
          }
          
          await operationLogService.createLog(
            config.module,
            config.operation,
            businessKey,
            operator,
            beforeData,
            afterData,
            ipAddress
          );
        }
      } catch (error) {
        console.error('Failed to create operation log:', error);
      }
    });

    next();
  };
};
