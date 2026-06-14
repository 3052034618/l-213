import { Request, Response } from 'express';
import { syncService } from '../services/sync.service';
import { RegisterExternalSystemDto, UpdateExternalSystemDto, QuerySyncRecordDto, SubmitAckDto } from '../dto/sync.dto';
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

  async testWebhook(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const result = await syncService.testWebhook(id);
      res.json({ code: 200, data: result, message: result.success ? '测试成功' : '测试失败' });
    } catch (err: any) {
      res.status(400).json({ code: 400, message: err.message });
    }
  }

  async queryRecords(req: Request, res: Response) {
    try {
      const dto = plainToInstance(QuerySyncRecordDto, req.query, { enableImplicitConversion: true });
      const errors = await validate(dto);
      if (errors.length > 0) {
        const details = errors.map(e => `${e.property}: ${Object.values(e.constraints || {}).join('; ')}`).join(' | ');
        return res.status(400).json({ code: 400, message: '查询参数错误', errors: details });
      }
      const result = await syncService.querySyncRecords({
        businessKey: dto.businessKey,
        syncType: dto.syncType as any,
        targetSystem: dto.targetSystem,
        status: dto.status,
        externalAckStatus: dto.externalAckStatus,
        errorCategory: dto.errorCategory,
        page: dto.page,
        pageSize: dto.pageSize
      });
      res.json({ code: 200, ...result });
    } catch (err: any) {
      res.status(500).json({ code: 500, message: err.message });
    }
  }

  async getRecordDetail(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const r = await syncService.getSyncRecordDetail(id);
      if (!r) return res.status(404).json({ code: 404, message: '记录不存在' });
      res.json({ code: 200, data: r });
    } catch (err: any) {
      res.status(500).json({ code: 500, message: err.message });
    }
  }

  async retryRecord(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const force = req.query.force === 'true';
      const record = await syncService.retrySync(id, force);
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

  async submitAck(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const dto = plainToInstance(SubmitAckDto, req.body, { enableImplicitConversion: true });
      const errors = await validate(dto);
      if (errors.length > 0) {
        return res.status(400).json({ code: 400, message: '参数错误', errors });
      }
      const r = await syncService.submitAck(id, dto);
      res.json({ code: 200, data: r, message: '回执已登记' });
    } catch (err: any) {
      res.status(400).json({ code: 400, message: err.message });
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

  async listPolicies(req: Request, res: Response) {
    try {
      const list = await syncService.listRetryPolicies();
      res.json({ code: 200, data: list, total: list.length });
    } catch (err: any) {
      res.status(500).json({ code: 500, message: err.message });
    }
  }

  async updatePolicy(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const updated = await syncService.updateRetryPolicy(id, req.body);
      res.json({ code: 200, data: updated, message: '策略已更新' });
    } catch (err: any) {
      res.status(400).json({ code: 400, message: err.message });
    }
  }
}

export const syncController = new SyncController();
