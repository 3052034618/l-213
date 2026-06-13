import { Request, Response } from 'express';
import { syncService } from '../services/sync.service';
import { RegisterExternalSystemDto, UpdateExternalSystemDto, QuerySyncRecordDto } from '../dto/sync.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

class SyncController {
  async registerSystem(req: Request, res: Response) {
    try {
      const dto = plainToInstance(RegisterExternalSystemDto, req.body, { enableImplicitConversion: true });
      const errors = await validate(dto);
      if (errors.length > 0) {
        return res.status(400).json({ code: 400, message: '参数错误', errors });
      }
      const system = await syncService.registerExternalSystem(
        dto.systemCode, dto.systemName, dto.systemType, dto.webhookUrl, dto.authToken
      );
      res.json({ code: 200, data: system, message: '外部系统注册成功' });
    } catch (err: any) {
      res.status(400).json({ code: 400, message: err.message });
    }
  }

  async updateSystem(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const dto = plainToInstance(UpdateExternalSystemDto, req.body, { enableImplicitConversion: true });
      const errors = await validate(dto);
      if (errors.length > 0) {
        return res.status(400).json({ code: 400, message: '参数错误', errors });
      }
      const system = await syncService.updateExternalSystem(id, dto);
      res.json({ code: 200, data: system, message: '更新成功' });
    } catch (err: any) {
      res.status(400).json({ code: 400, message: err.message });
    }
  }

  async listSystems(req: Request, res: Response) {
    try {
      const list = await syncService.listExternalSystems();
      res.json({ code: 200, data: list, total: list.length });
    } catch (err: any) {
      res.status(500).json({ code: 500, message: err.message });
    }
  }

  async queryRecords(req: Request, res: Response) {
    try {
      const dto = plainToInstance(QuerySyncRecordDto, req.query, { enableImplicitConversion: true });
      const result = await syncService.querySyncRecords({
        businessKey: dto.businessKey,
        syncType: dto.syncType as any,
        targetSystem: dto.targetSystem,
        status: dto.status,
        page: dto.page,
        pageSize: dto.pageSize
      });
      res.json({ code: 200, ...result });
    } catch (err: any) {
      res.status(500).json({ code: 500, message: err.message });
    }
  }

  async retryRecord(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const record = await syncService.retrySync(id);
      res.json({ code: 200, data: record, message: '重试完成' });
    } catch (err: any) {
      res.status(400).json({ code: 400, message: err.message });
    }
  }

  async retryAllFailed(req: Request, res: Response) {
    try {
      const result = await syncService.retryFailedRecords();
      res.json({ code: 200, data: result, message: '批量重试完成' });
    } catch (err: any) {
      res.status(500).json({ code: 500, message: err.message });
    }
  }

  async getStatistics(req: Request, res: Response) {
    try {
      const stats = await syncService.getSyncStatistics();
      res.json({ code: 200, data: stats });
    } catch (err: any) {
      res.status(500).json({ code: 500, message: err.message });
    }
  }
}

export const syncController = new SyncController();
