import { Request, Response } from 'express';
import { reminderService } from '../services/reminder.service';
import { policyService } from '../services/policy.service';
import { reportService } from '../services/report.service';
import {
  CreateReminderTaskDto, UpdateReminderTaskDto, ExportRenewalDto, FinanceReportDto,
  CreateReceiverDto, UpdateReceiverDto, QueryReminderHistoryDto
} from '../dto/report.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

class ReportController {
  async createReminderTask(req: Request, res: Response) {
    try {
      const dto = plainToInstance(CreateReminderTaskDto, req.body, { enableImplicitConversion: true });
      const errors = await validate(dto);
      if (errors.length > 0) return res.status(400).json({ code: 400, message: '参数错误', errors });
      const task = await reminderService.createTask(dto);
      res.json({ code: 200, data: task, message: '提醒任务创建成功' });
    } catch (e: any) {
      res.status(400).json({ code: 400, message: e.message });
    }
  }

  async updateReminderTask(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const dto = plainToInstance(UpdateReminderTaskDto, req.body, { enableImplicitConversion: true });
      const errors = await validate(dto);
      if (errors.length > 0) return res.status(400).json({ code: 400, message: '参数错误', errors });
      const task = await reminderService.updateTask(id, dto);
      res.json({ code: 200, data: task, message: '更新成功' });
    } catch (e: any) {
      res.status(400).json({ code: 400, message: e.message });
    }
  }

  async deleteReminderTask(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      await reminderService.deleteTask(id);
      res.json({ code: 200, message: '已删除' });
    } catch (e: any) {
      res.status(400).json({ code: 400, message: e.message });
    }
  }

  async listReminderTasks(req: Request, res: Response) {
    try {
      const enabledOnly = req.query.enabledOnly === 'true';
      const list = await reminderService.listTasks(enabledOnly);
      res.json({ code: 200, data: list, total: list.length });
    } catch (e: any) {
      res.status(500).json({ code: 500, message: e.message });
    }
  }

  async runReminderTask(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const result = await reminderService.runTask(id);
      res.json({ code: 200, data: result, message: '任务执行完成' });
    } catch (e: any) {
      res.status(400).json({ code: 400, message: e.message });
    }
  }

  async runAllReminderTasks(req: Request, res: Response) {
    try {
      const result = await reminderService.runAllDueTasks();
      res.json({ code: 200, data: result, message: '批量执行完成' });
    } catch (e: any) {
      res.status(500).json({ code: 500, message: e.message });
    }
  }

  async listReminderHistories(req: Request, res: Response) {
    try {
      const dto = plainToInstance(QueryReminderHistoryDto, req.query, { enableImplicitConversion: true });
      const errors = await validate(dto);
      if (errors.length > 0) return res.status(400).json({ code: 400, message: '参数错误', errors });
      const result = await reminderService.listHistories(dto);
      res.json({ code: 200, ...result });
    } catch (e: any) {
      res.status(500).json({ code: 500, message: e.message });
    }
  }

  async createReceiver(req: Request, res: Response) {
    try {
      const dto = plainToInstance(CreateReceiverDto, req.body, { enableImplicitConversion: true });
      const errors = await validate(dto);
      if (errors.length > 0) return res.status(400).json({ code: 400, message: '参数错误', errors });
      const r = await reminderService.createReceiver(dto);
      res.json({ code: 200, data: r, message: '接收对象创建成功' });
    } catch (e: any) {
      res.status(400).json({ code: 400, message: e.message });
    }
  }

  async updateReceiver(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const dto = plainToInstance(UpdateReceiverDto, req.body, { enableImplicitConversion: true });
      const errors = await validate(dto);
      if (errors.length > 0) return res.status(400).json({ code: 400, message: '参数错误', errors });
      const r = await reminderService.updateReceiver(id, dto);
      res.json({ code: 200, data: r, message: '更新成功' });
    } catch (e: any) {
      res.status(400).json({ code: 400, message: e.message });
    }
  }

  async deleteReceiver(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      await reminderService.deleteReceiver(id);
      res.json({ code: 200, message: '已删除' });
    } catch (e: any) {
      res.status(400).json({ code: 400, message: e.message });
    }
  }

  async listReceivers(req: Request, res: Response) {
    try {
      const category = req.query.category as string | undefined;
      const list = await reminderService.listReceivers(category);
      res.json({ code: 200, data: list, total: list.length });
    } catch (e: any) {
      res.status(500).json({ code: 500, message: e.message });
    }
  }

  async getExpiringGrouped(req: Request, res: Response) {
    try {
      const days = Number(req.query.days) || 30;
      const groupBy = (req.query.groupBy as 'company' | 'assetType' | 'expiryMonth') || 'assetType';
      const result = await policyService.getExpiringPoliciesGrouped(days, groupBy);
      res.json({ code: 200, ...result });
    } catch (e: any) {
      res.status(500).json({ code: 500, message: e.message });
    }
  }

  async exportRenewalCsv(req: Request, res: Response) {
    try {
      const dto = plainToInstance(ExportRenewalDto, req.query, { enableImplicitConversion: true });
      const errors = await validate(dto);
      if (errors.length > 0) return res.status(400).json({ code: 400, message: '参数错误', errors });
      const csv = await reminderService.exportRenewalCsv(dto.days, dto.assetType, dto.batchNo);
      const batchPart = dto.batchNo ? `_${dto.batchNo}` : '';
      const filename = encodeURIComponent(`续保清单${batchPart}_${new Date().toISOString().split('T')[0]}.csv`);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
      res.send(csv);
    } catch (e: any) {
      res.status(500).json({ code: 500, message: e.message });
    }
  }

  async traceBusinessChain(req: Request, res: Response) {
    try {
      const key = String(req.query.key || '');
      if (!key) return res.status(400).json({ code: 400, message: '请提供 key 参数（资产编号/保单号/理赔号）' });
      const chain = await reportService.traceByBusinessKey(key);
      res.json({
        code: 200,
        data: chain,
        message: `查询到关联记录 - 资产:${chain.asset ? 1 : 0} 保单:${chain.policies.length} 理赔:${chain.claims.length} 材料:${chain.materials.length} 日志:${chain.logs.length} 同步:${chain.syncRecords.length} 时间线事件:${chain.timeline.length}`
      });
    } catch (e: any) {
      res.status(500).json({ code: 500, message: e.message });
    }
  }

  async getFinanceReport(req: Request, res: Response) {
    try {
      const dto = plainToInstance(FinanceReportDto, req.query, { enableImplicitConversion: true });
      const errors = await validate(dto);
      if (errors.length > 0) return res.status(400).json({ code: 400, message: '参数错误', errors });
      const report = await reportService.getFinanceReport(dto.startDate, dto.endDate);
      res.json({ code: 200, data: report });
    } catch (e: any) {
      res.status(500).json({ code: 500, message: e.message });
    }
  }

  async exportFinanceReport(req: Request, res: Response) {
    try {
      const dto = plainToInstance(FinanceReportDto, req.query, { enableImplicitConversion: true });
      const errors = await validate(dto);
      if (errors.length > 0) return res.status(400).json({ code: 400, message: '参数错误', errors });
      const csv = await reportService.exportReportCsv(dto.startDate, dto.endDate);
      const filename = encodeURIComponent(`保险财务报表_${dto.startDate}_${dto.endDate}.csv`);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
      res.send(csv);
    } catch (e: any) {
      res.status(500).json({ code: 500, message: e.message });
    }
  }
}

export const reportController = new ReportController();
