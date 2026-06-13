import { getDb, OperationLog } from '../config/database';
import { assetService } from './asset.service';
import { policyService } from './policy.service';
import { claimService } from './claim.service';

export interface TraceChain {
  asset?: any;
  policies: any[];
  claims: any[];
  logs: OperationLog[];
  syncRecords: any[];
}

export interface FinanceReport {
  startDate: string;
  endDate: string;
  premium: {
    total: number;
    byMonth: Record<string, number>;
    byCompany: Record<string, number>;
  };
  insuredAmount: {
    total: number;
    byMonth: Record<string, number>;
    byCompany: Record<string, number>;
  };
  claim: {
    claimed: number;
    approved: number;
    paid: number;
    byMonth: { claimed: Record<string, number>; approved: Record<string, number>; paid: Record<string, number> };
    pendingNotSettled: number;
    pendingCount: number;
  };
  policies: {
    newCount: number;
    expiredCount: number;
    renewedCount: number;
    activeCount: number;
  };
}

export class ReportService {
  async traceByBusinessKey(key: string): Promise<TraceChain> {
    const db = getDb();
    let assetNo = '';
    let policyNos: string[] = [];
    let claimNos: string[] = [];

    const asset = await assetService.getAssetByNo(key);
    if (asset) {
      assetNo = asset.assetNo;
      const policies = await policyService.getPoliciesByAssetNo(asset.assetNo);
      policyNos = policies.map(p => p.policyNo);
      for (const p of policies) {
        const relatedClaims = db.data!.claims.filter(c => c.policyId === p.id);
        claimNos = claimNos.concat(relatedClaims.map(c => c.claimNo));
      }
    }

    if (!asset) {
      const policy = await policyService.getPolicyByNo(key);
      if (policy) {
        policyNos = [policy.policyNo];
        if (policy.asset) assetNo = policy.asset.assetNo;
        const relatedClaims = db.data!.claims.filter(c => c.policyId === policy.id);
        claimNos = relatedClaims.map(c => c.claimNo);
      }
    }

    if (!asset && policyNos.length === 0) {
      const claim = await claimService.getClaimByNo(key);
      if (claim) {
        claimNos = [claim.claimNo];
        if (claim.policy?.policyNo) policyNos = [claim.policy.policyNo];
        if (claim.asset?.assetNo) assetNo = claim.asset.assetNo;
      }
    }

    const allBusinessKeys = [assetNo, ...policyNos, ...claimNos].filter(Boolean);
    const logs = db.data!.logs
      .filter(l => l.businessKey && allBusinessKeys.includes(l.businessKey))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const syncRecords = db.data!.syncRecords
      .filter(r => allBusinessKeys.includes(r.businessKey))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const policiesData = await Promise.all(policyNos.map(p => policyService.getPolicyByNo(p)));
    const claimsData = await Promise.all(claimNos.map(c => claimService.getClaimByNo(c)));
    const assetData = assetNo ? await assetService.getAssetByNo(assetNo) : null;

    return {
      asset: assetData || undefined,
      policies: policiesData.filter(Boolean) as any[],
      claims: claimsData.filter(Boolean) as any[],
      logs,
      syncRecords
    };
  }

  async getFinanceReport(startDate: string, endDate: string): Promise<FinanceReport> {
    const db = getDb();
    const start = new Date(startDate);
    const end = new Date(endDate + 'T23:59:59');

    const inRange = (dateStr: string) => {
      const d = new Date(dateStr);
      return d >= start && d <= end;
    };

    const policiesInRange = db.data!.policies.filter(p => inRange(p.createdAt));
    const settledClaims = db.data!.claims.filter(c => inRange(c.updatedAt));

    const premiumByMonth: Record<string, number> = {};
    const premiumByCompany: Record<string, number> = {};
    const amountByMonth: Record<string, number> = {};
    const amountByCompany: Record<string, number> = {};
    let totalPremium = 0;
    let totalInsuredAmount = 0;

    let newCount = 0, expiredCount = 0, renewedCount = 0, activeCount = 0;

    for (const p of policiesInRange) {
      const month = p.createdAt.substring(0, 7);
      totalPremium += Number(p.premium);
      totalInsuredAmount += Number(p.insuranceAmount);
      premiumByMonth[month] = (premiumByMonth[month] || 0) + Number(p.premium);
      amountByMonth[month] = (amountByMonth[month] || 0) + Number(p.insuranceAmount);
      premiumByCompany[p.insuranceCompany] = (premiumByCompany[p.insuranceCompany] || 0) + Number(p.premium);
      amountByCompany[p.insuranceCompany] = (amountByCompany[p.insuranceCompany] || 0) + Number(p.insuranceAmount);
      if (p.status === 'active') activeCount++;
      if (p.status === 'renewed') renewedCount++;
      if (p.status === 'expired') expiredCount++;
      if (!p.remarks?.startsWith('续保自')) newCount++;
    }

    const claimedByMonth: Record<string, number> = {};
    const approvedByMonth: Record<string, number> = {};
    const paidByMonth: Record<string, number> = {};
    let totalClaimed = 0, totalApproved = 0, totalPaid = 0;
    let pendingNotSettledCount = 0, pendingCount = 0;

    for (const c of settledClaims) {
      const month = c.updatedAt.substring(0, 7);
      totalClaimed += Number(c.claimedAmount);
      claimedByMonth[month] = (claimedByMonth[month] || 0) + Number(c.claimedAmount);

      if (c.status === 'approved' || c.status === 'settled') {
        totalApproved += Number(c.approvedAmount);
        approvedByMonth[month] = (approvedByMonth[month] || 0) + Number(c.approvedAmount);
      }
      if (c.status === 'settled') {
        totalPaid += Number(c.approvedAmount);
        paidByMonth[month] = (paidByMonth[month] || 0) + Number(c.approvedAmount);
      }
      if (!['settled', 'rejected', 'withdrawn'].includes(c.status)) {
        pendingNotSettledCount++;
        if (c.status !== 'settled') pendingCount++;
      }
    }

    return {
      startDate,
      endDate,
      premium: {
        total: totalPremium,
        byMonth: premiumByMonth,
        byCompany: premiumByCompany
      },
      insuredAmount: {
        total: totalInsuredAmount,
        byMonth: amountByMonth,
        byCompany: amountByCompany
      },
      claim: {
        claimed: totalClaimed,
        approved: totalApproved,
        paid: totalPaid,
        byMonth: {
          claimed: claimedByMonth,
          approved: approvedByMonth,
          paid: paidByMonth
        },
        pendingNotSettled: pendingNotSettledCount,
        pendingCount
      },
      policies: {
        newCount,
        expiredCount,
        renewedCount,
        activeCount
      }
    };
  }

  async exportReportCsv(startDate: string, endDate: string): Promise<string> {
    const r = await this.getFinanceReport(startDate, endDate);
    const lines: string[] = ['\uFEFF企业资产保险财务报表'];
    lines.push(`统计期间,${r.startDate} 至 ${r.endDate}`);
    lines.push('');
    lines.push('=== 保费收入 ===');
    lines.push('项目,金额');
    lines.push(`总保费,${r.premium.total}`);
    lines.push('按月份:');
    for (const [m, v] of Object.entries(r.premium.byMonth)) lines.push(`  ${m},${v}`);
    lines.push('按保险公司:');
    for (const [c, v] of Object.entries(r.premium.byCompany)) lines.push(`  ${c},${v}`);
    lines.push('');
    lines.push('=== 保额统计 ===');
    lines.push(`总保额,${r.insuredAmount.total}`);
    lines.push('');
    lines.push('=== 理赔支出 ===');
    lines.push(`申请索赔总额,${r.claim.claimed}`);
    lines.push(`审批赔付额,${r.claim.approved}`);
    lines.push(`实际已赔付,${r.claim.paid}`);
    lines.push(`未结案数量,${r.claim.pendingNotSettled}`);
    lines.push('');
    lines.push('=== 保单情况 ===');
    lines.push(`新增保单,${r.policies.newCount}`);
    lines.push(`续保保单,${r.policies.renewedCount}`);
    lines.push(`到期保单,${r.policies.expiredCount}`);
    lines.push(`有效保单,${r.policies.activeCount}`);
    return lines.join('\n');
  }
}

export const reportService = new ReportService();
