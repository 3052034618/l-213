import { getDb, nextId, now, Claim } from '../config/database';
import { CreateClaimDto, QueryClaimDto, ApproveClaimDto, RejectClaimDto } from '../dto/claim.dto';
import { generateClaimNo, getCurrentDateString } from '../utils/dateUtils';
import { assetService } from './asset.service';
import { policyService } from './policy.service';
import { materialService } from './material.service';

export class ClaimService {
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
      applicant: dto.applicant,
      createdAt: now(),
      updatedAt: now(),
      asset,
      policy
    };
    db.data!.claims.push(claim);
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
      return { ...claim, asset: asset || undefined, policy: policy || undefined, materials };
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
    
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    const total = filtered.length;
    const list = await Promise.all(
      filtered.slice((page - 1) * pageSize, page * pageSize)
        .map(async c => ({
          ...c,
          asset: await assetService.getAssetById(c.assetId) || undefined,
          policy: await policyService.getPolicyByNo(
            db.data!.policies.find(p => p.id === c.policyId)?.policyNo || ''
          ) || undefined
        }))
    );
    
    return { list, total };
  }

  async getClaimStatus(claimNo: string): Promise<any> {
    const claim = await this.getClaimByNo(claimNo);
    if (!claim) {
      throw new Error(`理赔申请 ${claimNo} 不存在`);
    }

    const statusMap: Record<string, string> = {
      'pending': '待受理',
      'reviewing': '审核中',
      'approved': '已赔付',
      'rejected': '已驳回',
      'withdrawn': '已撤回'
    };

    return {
      claimNo: claim.claimNo,
      status: claim.status,
      statusText: statusMap[claim.status] || claim.status,
      claimedAmount: claim.claimedAmount,
      approvedAmount: claim.approvedAmount,
      accidentDate: claim.accidentDate,
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
      materials: claim.materials,
      adjusterOpinion: claim.adjusterOpinion,
      rejectionReason: claim.rejectionReason,
      settlementDate: claim.settlementDate
    };
  }

  async withdrawClaim(claimNo: string, operator: string): Promise<Claim> {
    const db = getDb();
    const index = db.data!.claims.findIndex(c => c.claimNo === claimNo);
    if (index === -1) {
      throw new Error(`理赔申请 ${claimNo} 不存在`);
    }

    const claim = db.data!.claims[index];
    if (claim.status !== 'pending') {
      throw new Error(`仅待受理状态的申请可撤回`);
    }

    claim.status = 'withdrawn';
    claim.updatedAt = now();
    await db.write();
    return this.getClaimByNo(claimNo) as Promise<Claim>;
  }

  async approveClaim(claimNo: string, dto: ApproveClaimDto): Promise<Claim> {
    const db = getDb();
    const index = db.data!.claims.findIndex(c => c.claimNo === claimNo);
    if (index === -1) {
      throw new Error(`理赔申请 ${claimNo} 不存在`);
    }

    const claim = db.data!.claims[index];
    if (claim.status === 'withdrawn' || claim.status === 'rejected' || claim.status === 'approved') {
      throw new Error(`该申请状态不允许审批`);
    }

    claim.status = 'approved';
    claim.approvedAmount = dto.approvedAmount;
    claim.adjusterOpinion = dto.adjusterOpinion;
    claim.settlementDate = dto.settlementDate || getCurrentDateString();
    claim.approver = dto.approver;
    claim.updatedAt = now();
    await db.write();
    return this.getClaimByNo(claimNo) as Promise<Claim>;
  }

  async rejectClaim(claimNo: string, dto: RejectClaimDto): Promise<Claim> {
    const db = getDb();
    const index = db.data!.claims.findIndex(c => c.claimNo === claimNo);
    if (index === -1) {
      throw new Error(`理赔申请 ${claimNo} 不存在`);
    }

    const claim = db.data!.claims[index];
    if (claim.status === 'withdrawn' || claim.status === 'rejected' || claim.status === 'approved') {
      throw new Error(`该申请状态不允许审批`);
    }

    claim.status = 'rejected';
    claim.rejectionReason = dto.rejectionReason;
    claim.approver = dto.approver;
    claim.updatedAt = now();
    await db.write();
    return this.getClaimByNo(claimNo) as Promise<Claim>;
  }

  async startReview(claimNo: string, operator: string): Promise<Claim> {
    const db = getDb();
    const index = db.data!.claims.findIndex(c => c.claimNo === claimNo);
    if (index === -1) {
      throw new Error(`理赔申请 ${claimNo} 不存在`);
    }

    const claim = db.data!.claims[index];
    if (claim.status !== 'pending') {
      throw new Error(`仅待受理状态的申请可开始审核`);
    }

    claim.status = 'reviewing';
    claim.updatedAt = now();
    await db.write();
    return this.getClaimByNo(claimNo) as Promise<Claim>;
  }

  async getClaimStatistics(): Promise<any> {
    const db = getDb();
    const allClaims = db.data!.claims;
    const pendingCount = allClaims.filter(c => c.status === 'pending').length;
    const reviewingCount = allClaims.filter(c => c.status === 'reviewing').length;
    const approvedCount = allClaims.filter(c => c.status === 'approved').length;
    const rejectedCount = allClaims.filter(c => c.status === 'rejected').length;
    const withdrawnCount = allClaims.filter(c => c.status === 'withdrawn').length;
    const totalClaimed = allClaims.reduce((sum, c) => sum + Number(c.claimedAmount), 0);
    const totalApproved = allClaims.reduce((sum, c) => sum + Number(c.approvedAmount), 0);

    return {
      total: allClaims.length,
      byStatus: {
        pending: pendingCount,
        reviewing: reviewingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        withdrawn: withdrawnCount
      },
      totalClaimedAmount: totalClaimed,
      totalApprovedAmount: totalApproved,
      payoutRate: totalClaimed > 0 ? (totalApproved / totalClaimed) : 0
    };
  }
}

export const claimService = new ClaimService();
