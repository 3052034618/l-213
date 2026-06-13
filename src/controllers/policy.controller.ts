import { Request, Response } from 'express';
import { policyService } from '../services/policy.service';
import { CreatePolicyDto, QueryPolicyDto, RenewalQueryDto } from '../dto/policy.dto';

export class PolicyController {
  async createPolicy(req: Request, res: Response) {
    try {
      const dto = req.body as CreatePolicyDto;
      const policy = await policyService.createPolicy(dto);
      res.status(201).json({
        code: 200,
        message: '投保登记成功',
        data: policy
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async getPolicy(req: Request, res: Response) {
    try {
      const { policyNo } = req.params;
      const policy = await policyService.getPolicyByNo(policyNo);
      if (!policy) {
        return res.status(404).json({
          code: 404,
          message: '保单不存在'
        });
      }
      res.json({
        code: 200,
        message: '查询成功',
        data: policy
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async getPoliciesByAssetNo(req: Request, res: Response) {
    try {
      const { assetNo } = req.params;
      const policies = await policyService.getPoliciesByAssetNo(assetNo);
      res.json({
        code: 200,
        message: '查询成功',
        data: policies
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async queryPolicies(req: Request, res: Response) {
    try {
      const dto = req.query as unknown as QueryPolicyDto;
      const result = await policyService.queryPolicies(dto);
      res.json({
        code: 200,
        message: '查询成功',
        data: result.list,
        total: result.total,
        page: dto.page || 1,
        pageSize: dto.pageSize || 20
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async getExpiringPolicies(req: Request, res: Response) {
    try {
      const days = Number(req.query.days) || 30;
      const policies = await policyService.getExpiringPolicies(days);
      res.json({
        code: 200,
        message: '查询成功',
        data: policies,
        count: policies.length
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async generateRenewalList(req: Request, res: Response) {
    try {
      const dto = req.body as RenewalQueryDto;
      const result = await policyService.generateRenewalList(dto);
      res.json({
        code: 200,
        message: '续保清单生成成功',
        data: result.list,
        total: result.total,
        summary: result.summary
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async getFeeSummary(req: Request, res: Response) {
    try {
      const summary = await policyService.getFeeSummary();
      res.json({
        code: 200,
        message: '费用汇总查询成功',
        data: summary
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async renewPolicy(req: Request, res: Response) {
    try {
      const { policyNo } = req.params;
      const { effectiveDate, expiryDate, premium, operator } = req.body;
      const policy = await policyService.renewPolicy(policyNo, effectiveDate, expiryDate, premium, operator);
      res.json({
        code: 200,
        message: '续保成功',
        data: policy
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }
}

export const policyController = new PolicyController();
