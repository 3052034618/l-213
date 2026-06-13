import { getDb, nextId, now, Claim, ClaimApprovalNode } from '../config/database';
import { CreateClaimDto, QueryClaimDto, ApproveClaimDto, RejectClaimDto } from '../dto/claim.dto';
import { generateClaimNo, getCurrentDateString } from '../utils/dateUtils';
import { assetService } from './asset.service';
import { policyService } from './policy.service';
import { materialService } from './material.service';
import { syncService } from './sync.service';

export const STATUS_MAP: Record<string, string> = {
  'pending': '待受理',
  'reviewing_l1': '一级审核中',
  'reviewing_l2': '二级审核中',
  'supplementing': '待补件',
  'approved': '审批通过待赔付',
  'settled': '已赔付',
  'rejected': '已驳回',
  'withdrawn': '已撤回'
};

export const CLAIM_STEPS = [
  { step: 1, name: '提交申请', role: '申请人' },
  { step: 2, name: '一级审核', role: '理赔专员' },
  { step: 3, name: '二级审核', role: '财务主管' },
  { step: 4, name: '赔付确认', role: '财务出纳' }
];

export class ClaimService {
  private addApprovalNode(
    claimId: number, step: number, stepName: string, action: string,
    operator: string, result: string, opinion?: string, operatorRole?: string
  ): ClaimApprovalNode {
    const db = getDb();
    const node: ClaimApprovalNode = {
      id: nextId('approvalNodeId'),
      claimId,
      step,
      stepName,
      action,
      operator,
      operatorRole,
      opinion,
      result,
      createdAt: now()
    };
    db.data!.claimApprovalNodes.push(node);
    return node;
  }

  private getApprovalNodes(claimId: number): ClaimApprovalNode[] {
    return getDb().data!.claimApprovalNodes
      .filter(n => n.claimId === claimId)
      .sort((a, b) => a.step - b.step || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createClaim(dto: CreateClaimDto): Promise<Claim> {
    const db = getDb();
    const asset = await assetService.getAssetByNo(dto.assetNo);
    if (!asset) {
      throw new Error(`资产编号 ${dto.assetNo} 不存在`);
    }

    let policy;
    if (dto.policyNo) {
      policy = await policyService.getPolicyByNo(dto.policyNo);
      if (!policy) {
        throw new Error(`保单 ${dto.policyNo} 不存在`);
      }
    } else {
      const policies = await policyService.getPoliciesByAssetNo(dto.assetNo);
      const activePolicies = policies.filter(p => p.status === 'active');
      if (activePolicies.length === 0) {
        throw new Error(`该资产没有有效保单`);
      }
      policy = activePolicies[0];
    }

    if (policy.assetId !== asset.id) {
      throw new Error(`保单与资产不匹配`);
    }

    const claim: Claim = {
      id: nextId('claimId'),
      claimNo: generateClaimNo(),
      assetId: asset.id,
      policyId: policy.id,
      accidentDate: dto.accidentDate,
      accidentDescription: dto.accidentDescription,
      claimedAmount: dto.claimedAmount,
      approvedAmount: 0,
      status: 'pending',
      currentStep: 1,
      applicant: dto.applicant,
      createdAt: now(),
      updatedAt: now(),
      asset,
      policy
    };
    db.data!.claims.push(claim);

    this.addApprovalNode(claim.id, 1, '提交申请', 'submit', dto.applicant, 'pass', '申请提交', '申请人');

    await db.write();
    return claim;
  }

  async getClaimByNo(claimNo: string): Promise<Claim | null> {
    const db = getDb();
    const claim = db.data!.claims.find(c => c.claimNo === claimNo);
    if (claim) {
      const asset = await assetService.getAssetById(claim.assetId);
      const policy = await policyService.getPolicyByNo(
        db.data!.policies.find(p => p.id === claim.policyId)?.policyNo || ''
      );
      const materials = await materialService.getMaterialsByClaimNo(claimNo);
      const approvalNodes = this.getApprovalNodes(claim.id);
      return {
        ...claim,
        asset: asset || undefined,
        policy: policy || undefined,
        materials,
        approvalNodes
      };
    }
    return null;
  }

  async queryClaims(dto: QueryClaimDto): Promise<{ list: Claim[]; total: number }> {
    const db = getDb();
    const page = dto.page || 1;
    const pageSize = dto.pageSize || 20;

    let filtered = [...db.data!.claims];

    if (dto.assetNo) {
      const asset = await assetService.getAssetByNo(dto.assetNo);
      if (asset) {
        filtered = filtered.filter(c => c.assetId === asset.id);
      } else {
        return { list: [], total: 0 };
      }
    }
    if (dto.claimNo) filtered = filtered.filter(c => c.claimNo === dto.claimNo);
    if (dto.status) filtered = filtered.filter(c => c.status === dto.status);
    if (dto.currentStep) filtered = filtered.filter(c => c.currentStep === dto.currentStep);

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = filtered.length;
    const list = await Promise.all(
      filtered.slice((page - 1) * pageSize, page * pageSize)
        .map(async c => ({
          ...c,
          asset: await assetService.getAssetById(c.assetId) || undefined,
          policy: await policyService.getPolicyByNo(
            db.data!.policies.find(p => p.id === c.policyId)?.policyNo || ''
          ) || undefined,
          approvalNodes: this.getApprovalNodes(c.id)
        }))
    );

    return { list, total };
  }

  async getClaimStatus(claimNo: string): Promise<any> {
    const claim = await this.getClaimByNo(claimNo);
    if (!claim) {
      throw new Error(`理赔申请 ${claimNo} 不存在`);
    }

    const currentStepInfo = CLAIM_STEPS.find(s => s.step === claim.currentStep) || CLAIM_STEPS[0];
    const nodes = claim.approvalNodes || [];
    const stuckStep = nodes.length > 0 && nodes[nodes.length - 1].result === 'reject'
      ? nodes[nodes.length - 1].step
      : null;

    return {
      claimNo: claim.claimNo,
      status: claim.status,
      statusText: STATUS_MAP[claim.status] || claim.status,
      currentStep: claim.currentStep,
      currentStepName: currentStepInfo.name,
      currentRole: currentStepInfo.role,
      claimedAmount: claim.claimedAmount,
      approvedAmount: claim.approvedAmount,
      accidentDate: claim.accidentDate,
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
      materials: claim.materials,
      adjusterOpinion: claim.adjusterOpinion,
      rejectionReason: claim.rejectionReason,
      settlementDate: claim.settlementDate,
      supplementNotice: claim.supplementNotice,
      confirmedSettlement: claim.confirmedSettlement,
      approvalFlow: nodes.map(n => ({
        step: n.step,
        stepName: n.stepName,
        action: n.action,
        operator: n.operator,
        operatorRole: n.operatorRole,
        opinion: n.opinion,
        result: n.result,
        resultText: n.result === 'pass' ? '通过' : n.result === 'reject' ? '驳回' : n.result === 'supplement' ? '补件' : n.result,
        time: n.createdAt
      })),
      stuckStep,
      stuckStepName: stuckStep ? CLAIM_STEPS.find(s => s.step === stuckStep)?.name : undefined
    };
  }

  async withdrawClaim(claimNo: string, operator: string): Promise<Claim> {
    const db = getDb();
    const index = db.data!.claims.findIndex(c => c.claimNo === claimNo);
    if (index === -1) {
      throw new Error(`理赔申请 ${claimNo} 不存在`);
    }

    const claim = db.data!.claims[index];
    if (!['pending', 'supplementing'].includes(claim.status)) {
      throw new Error(`仅待受理或待补件状态的申请可撤回`);
    }

    claim.status = 'withdrawn';
    claim.updatedAt = now();
    this.addApprovalNode(claim.id, claim.currentStep || 1, '撤回申请', 'withdraw', operator, 'reject', '申请人撤回', '申请人');
    await db.write();

    const result = await this.getClaimByNo(claimNo) as Claim;
    syncService.pushToExternalSystems('claim_withdrawn', claimNo, result).catch(() => { });
    return result;
  }

  async startL1Review(claimNo: string, operator: string, opinion?: string): Promise<Claim> {
    const db = getDb();
    const index = db.data!.claims.findIndex(c => c.claimNo === claimNo);
    if (index === -1) throw new Error(`理赔申请 ${claimNo} 不存在`);
    const claim = db.data!.claims[index];

    if (claim.status !== 'pending') {
      throw new Error(`仅待受理状态可开始一级审核`);
    }

    claim.status = 'reviewing_l1';
    claim.currentStep = 2;
    claim.updatedAt = now();
    this.addApprovalNode(claim.id, 2, '一级审核', 'start_review', operator, 'processing', opinion || '开始审核', '理赔专员');
    await db.write();
    return this.getClaimByNo(claimNo) as Promise<Claim>;
  }

  async passL1Review(claimNo: string, operator: string, opinion?: string): Promise<Claim> {
    const db = getDb();
    const index = db.data!.claims.findIndex(c => c.claimNo === claimNo);
    if (index === -1) throw new Error(`理赔申请 ${claimNo} 不存在`);
    const claim = db.data!.claims[index];

    if (claim.status !== 'reviewing_l1') {
      throw new Error(`仅一级审核中状态可通过`);
    }

    claim.status = 'reviewing_l2';
    claim.currentStep = 3;
    claim.updatedAt = now();
    this.addApprovalNode(claim.id, 2, '一级审核', 'pass', operator, 'pass', opinion || '一级审核通过', '理赔专员');
    await db.write();
    return this.getClaimByNo(claimNo) as Promise<Claim>;
  }

  async requestSupplement(claimNo: string, operator: string, notice: string): Promise<Claim> {
    const db = getDb();
    const index = db.data!.claims.findIndex(c => c.claimNo === claimNo);
    if (index === -1) throw new Error(`理赔申请 ${claimNo} 不存在`);
    const claim = db.data!.claims[index];

    if (!['reviewing_l1', 'reviewing_l2'].includes(claim.status)) {
      throw new Error(`仅审核中状态可退回补件`);
    }

    const step = claim.currentStep || 2;
    claim.status = 'supplementing';
    claim.supplementNotice = notice;
    claim.updatedAt = now();
    this.addApprovalNode(claim.id, step, step === 2 ? '一级审核' : '二级审核', 'supplement', operator, 'supplement', notice, step === 2 ? '理赔专员' : '财务主管');
    await db.write();
    return this.getClaimByNo(claimNo) as Promise<Claim>;
  }

  async resubmitClaim(claimNo: string, operator: string, remark?: string): Promise<Claim> {
    const db = getDb();
    const index = db.data!.claims.findIndex(c => c.claimNo === claimNo);
    if (index === -1) throw new Error(`理赔申请 ${claimNo} 不存在`);
    const claim = db.data!.claims[index];

    if (claim.status !== 'supplementing') {
      throw new Error(`仅待补件状态可重新提交`);
    }

    const materials = await materialService.getMaterialsByClaimNo(claimNo);
    if (materials.length === 0) {
      throw new Error(`请先补交材料后再重新提交`);
    }

    const lastReviewStep = (claim.currentStep && claim.currentStep > 1) ? claim.currentStep : 2;
    claim.status = lastReviewStep === 3 ? 'reviewing_l2' : 'reviewing_l1';
    claim.supplementNotice = undefined;
    claim.updatedAt = now();
    this.addApprovalNode(claim.id, 1, '重新提交', 'resubmit', operator, 'pass', remark || '补件完成重新提交', '申请人');
    await db.write();
    return this.getClaimByNo(claimNo) as Promise<Claim>;
  }

  async passL2Review(claimNo: string, dto: ApproveClaimDto): Promise<Claim> {
    const db = getDb();
    const index = db.data!.claims.findIndex(c => c.claimNo === claimNo);
    if (index === -1) throw new Error(`理赔申请 ${claimNo} 不存在`);
    const claim = db.data!.claims[index];

    if (claim.status !== 'reviewing_l2') {
      throw new Error(`仅二级审核中状态可审批`);
    }

    claim.status = 'approved';
    claim.currentStep = 4;
    claim.approvedAmount = dto.approvedAmount;
    claim.adjusterOpinion = dto.adjusterOpinion;
    claim.approver = dto.approver;
    claim.updatedAt = now();
    this.addApprovalNode(claim.id, 3, '二级审核', 'approve', dto.approver, 'pass', dto.adjusterOpinion, '财务主管');
    await db.write();

    const result = await this.getClaimByNo(claimNo) as Claim;
    syncService.pushToExternalSystems('claim_approved', claimNo, result).catch(() => { });
    return result;
  }

  async rejectClaim(claimNo: string, dto: RejectClaimDto): Promise<Claim> {
    const db = getDb();
    const index = db.data!.claims.findIndex(c => c.claimNo === claimNo);
    if (index === -1) throw new Error(`理赔申请 ${claimNo} 不存在`);
    const claim = db.data!.claims[index];

    if (['withdrawn', 'settled', 'rejected'].includes(claim.status)) {
      throw new Error(`该申请状态不允许驳回`);
    }

    const step = claim.currentStep || 2;
    claim.status = 'rejected';
    claim.rejectionReason = dto.rejectionReason;
    claim.approver = dto.approver;
    claim.updatedAt = now();
    this.addApprovalNode(claim.id, step, step === 3 ? '二级审核' : '一级审核', 'reject', dto.approver, 'reject', dto.rejectionReason, step === 3 ? '财务主管' : '理赔专员');
    await db.write();

    const result = await this.getClaimByNo(claimNo) as Claim;
    syncService.pushToExternalSystems('claim_rejected', claimNo, result).catch(() => { });
    return result;
  }

  async confirmSettlement(claimNo: string, operator: string, settlementDate?: string): Promise<Claim> {
    const db = getDb();
    const index = db.data!.claims.findIndex(c => c.claimNo === claimNo);
    if (index === -1) throw new Error(`理赔申请 ${claimNo} 不存在`);
    const claim = db.data!.claims[index];

    if (claim.status !== 'approved') {
      throw new Error(`仅审批通过状态可确认赔付`);
    }

    claim.status = 'settled';
    claim.currentStep = 4;
    claim.confirmedSettlement = true;
    claim.settlementDate = settlementDate || getCurrentDateString();
    claim.updatedAt = now();
    this.addApprovalNode(claim.id, 4, '赔付确认', 'settle', operator, 'pass', `已完成赔付，金额 ${claim.approvedAmount}`, '财务出纳');
    await db.write();

    const result = await this.getClaimByNo(claimNo) as Claim;
    syncService.pushToExternalSystems('claim_settled', claimNo, result).catch(() => { });
    return result;
  }

  async startReview(claimNo: string, operator: string): Promise<Claim> {
    return this.startL1Review(claimNo, operator);
  }

  async approveClaim(claimNo: string, dto: ApproveClaimDto): Promise<Claim> {
    const claim = await this.getClaimByNo(claimNo);
    if (!claim) throw new Error(`理赔申请 ${claimNo} 不存在`);
    if (claim.status === 'pending') {
      await this.startL1Review(claimNo, dto.approver);
      await this.passL1Review(claimNo, dto.approver, dto.adjusterOpinion);
    } else if (claim.status === 'reviewing_l1') {
      await this.passL1Review(claimNo, dto.approver, dto.adjusterOpinion);
    } else if (claim.status === 'supplementing') {
      throw new Error(`申请处于待补件状态，请先补交材料并重新提交`);
    }
    return this.passL2Review(claimNo, dto);
  }

  async getClaimStatistics(): Promise<any> {
    const db = getDb();
    const allClaims = db.data!.claims;
    const byStatus: Record<string, number> = {};
    const byStep: Record<string, number> = {};
    for (const c of allClaims) {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      if (c.currentStep) byStep[`step_${c.currentStep}`] = (byStep[`step_${c.currentStep}`] || 0) + 1;
    }
    const totalClaimed = allClaims.reduce((sum, c) => sum + Number(c.claimedAmount), 0);
    const totalApproved = allClaims.reduce((sum, c) => sum + Number(c.approvedAmount), 0);
    const pendingNotSettled = allClaims.filter(c => !['settled', 'rejected', 'withdrawn'].includes(c.status)).length;

    return {
      total: allClaims.length,
      byStatus,
      byStep,
      totalClaimedAmount: totalClaimed,
      totalApprovedAmount: totalApproved,
      payoutRate: totalClaimed > 0 ? (totalApproved / totalClaimed) : 0,
      pendingNotSettled
    };
  }
}

export const claimService = new ClaimService();
