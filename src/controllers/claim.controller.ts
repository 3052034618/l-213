import { Request, Response } from 'express';
import { claimService, CLAIM_STEPS, STATUS_MAP } from '../services/claim.service';
import {
  CreateClaimDto, QueryClaimDto, ApproveClaimDto, RejectClaimDto,
  ReviewOpinionDto, SupplementNoticeDto, ResubmitClaimDto, ConfirmSettlementDto
} from '../dto/claim.dto';

export class ClaimController {
  async createClaim(req: Request, res: Response) {
    try {
      const dto = req.body as CreateClaimDto;
      const claim = await claimService.createClaim(dto);
      res.status(201).json({
        code: 200,
        message: '理赔申请提交成功',
        data: claim
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async getClaim(req: Request, res: Response) {
    try {
      const { claimNo } = req.params;
      const claim = await claimService.getClaimByNo(claimNo);
      if (!claim) {
        return res.status(404).json({
          code: 404,
          message: '理赔申请不存在'
        });
      }
      res.json({
        code: 200,
        message: '查询成功',
        data: claim
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async queryClaims(req: Request, res: Response) {
    try {
      const dto = req.query as unknown as QueryClaimDto;
      const result = await claimService.queryClaims(dto);
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

  async getClaimStatus(req: Request, res: Response) {
    try {
      const { claimNo } = req.params;
      const status = await claimService.getClaimStatus(claimNo);
      res.json({
        code: 200,
        message: '状态查询成功',
        data: status
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async withdrawClaim(req: Request, res: Response) {
    try {
      const { claimNo } = req.params;
      const { operator } = req.body;
      const claim = await claimService.withdrawClaim(claimNo, operator);
      res.json({
        code: 200,
        message: '申请撤回成功',
        data: claim
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async approveClaim(req: Request, res: Response) {
    try {
      const { claimNo } = req.params;
      const dto = req.body as ApproveClaimDto;
      const claim = await claimService.approveClaim(claimNo, dto);
      res.json({
        code: 200,
        message: '理赔已批准',
        data: claim
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async rejectClaim(req: Request, res: Response) {
    try {
      const { claimNo } = req.params;
      const dto = req.body as RejectClaimDto;
      const claim = await claimService.rejectClaim(claimNo, dto);
      res.json({
        code: 200,
        message: '理赔已驳回',
        data: claim
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async startReview(req: Request, res: Response) {
    try {
      const { claimNo } = req.params;
      const { operator } = req.body;
      const claim = await claimService.startReview(claimNo, operator);
      res.json({
        code: 200,
        message: '已开始审核',
        data: claim
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async getStatistics(req: Request, res: Response) {
    try {
      const stats = await claimService.getClaimStatistics();
      res.json({
        code: 200,
        message: '统计查询成功',
        data: stats
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async startL1Review(req: Request, res: Response) {
    try {
      const { claimNo } = req.params;
      const dto = req.body as ReviewOpinionDto;
      const claim = await claimService.startL1Review(claimNo, dto.operator, dto.opinion);
      res.json({ code: 200, message: '已开始一级审核', data: claim });
    } catch (error: any) {
      res.status(400).json({ code: 400, message: error.message });
    }
  }

  async passL1Review(req: Request, res: Response) {
    try {
      const { claimNo } = req.params;
      const dto = req.body as ReviewOpinionDto;
      const claim = await claimService.passL1Review(claimNo, dto.operator, dto.opinion);
      res.json({ code: 200, message: '一级审核通过', data: claim });
    } catch (error: any) {
      res.status(400).json({ code: 400, message: error.message });
    }
  }

  async requestSupplement(req: Request, res: Response) {
    try {
      const { claimNo } = req.params;
      const dto = req.body as SupplementNoticeDto;
      const claim = await claimService.requestSupplement(claimNo, dto.operator, dto.notice);
      res.json({ code: 200, message: '已退回补件', data: claim });
    } catch (error: any) {
      res.status(400).json({ code: 400, message: error.message });
    }
  }

  async resubmitClaim(req: Request, res: Response) {
    try {
      const { claimNo } = req.params;
      const dto = req.body as ResubmitClaimDto;
      const claim = await claimService.resubmitClaim(claimNo, dto.operator, dto.remark);
      res.json({ code: 200, message: '已重新提交', data: claim });
    } catch (error: any) {
      res.status(400).json({ code: 400, message: error.message });
    }
  }

  async confirmSettlement(req: Request, res: Response) {
    try {
      const { claimNo } = req.params;
      const dto = req.body as ConfirmSettlementDto;
      const claim = await claimService.confirmSettlement(claimNo, dto.operator, dto.settlementDate);
      res.json({ code: 200, message: '赔付已确认', data: claim });
    } catch (error: any) {
      res.status(400).json({ code: 400, message: error.message });
    }
  }

  async getWorkflowConfig(req: Request, res: Response) {
    try {
      res.json({
        code: 200,
        data: {
          steps: CLAIM_STEPS,
          statusMap: STATUS_MAP
        }
      });
    } catch (error: any) {
      res.status(500).json({ code: 500, message: error.message });
    }
  }
}

export const claimController = new ClaimController();
