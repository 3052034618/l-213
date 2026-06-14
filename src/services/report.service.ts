import { getDb, OperationLog } from '../config/database';
import { assetService } from './asset.service';
import { policyService } from './policy.service';
import { claimService } from './claim.service';
import { SYNC_TYPE_NAMES } from './sync.service';

export interface TimelineEvent {
  time: string;
  category: 'asset' | 'policy' | 'claim' | 'material' | 'sync' | 'log';
  action: string;
  actionLabel: string;
  operator?: string;
  amount?: number;
  status?: string;
  detail: string;
  ref?: {
    claimNo?: string;
    policyNo?: string;
    syncRecordId?: number;
    logId?: number;
    materialId?: number;
  };
}

export interface TraceChain {
  asset?: any;
  policies: any[];
  claims: any[];
  logs: OperationLog[];
  syncRecords: any[];
  materials: any[];
  timeline: TimelineEvent[];
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

const ACTION_LABELS: Record<string, string> = {
  create: '创建资产',
  update: '更新资产',
  register_policy: '投保登记',
  renew_policy: '保单续保',
  create_claim: '理赔提交',
  review_claim: '受理审核',
  approve_claim: '审批通过',
  reject_claim: '审批驳回',
  withdraw_claim: '撤回申请',
  resubmit_claim: '重新提交',
  start_l1_review: '开始一级审核',
  pass_l1_review: '一级审核通过',
  request_supplement: '退回补件',
  pass_l2_review: '二级审核通过',
  confirm_settlement: '赔付确认',
  upload_material: '上传/登记材料',
  register_material: '登记材料',
};

export class ReportService {
  private label(a: string): string { return ACTION_LABELS[a] || a; }

  async traceByBusinessKey(key: string): Promise<TraceChain> {
    const db = getDb();
    let assetNo = '';
    let policyNos: string[] = [];
    let claimNos: string[] = [];
    let policyIds: number[] = [];
    let claimIds: number[] = [];

    const asset = await assetService.getAssetByNo(key);
    if (asset) {
      assetNo = asset.assetNo;
      const policies = await policyService.getPoliciesByAssetNo(asset.assetNo);
      policyNos = policies.map(p => p.policyNo);
      policyIds = policies.map(p => p.id);
      for (const p of policies) {
        const relatedClaims = db.data!.claims.filter(c => c.policyId === p.id);
        claimNos = claimNos.concat(relatedClaims.map(c => c.claimNo));
        claimIds = claimIds.concat(relatedClaims.map(c => c.id));
      }
    }

    if (!asset) {
      const policy = await policyService.getPolicyByNo(key);
      if (policy) {
        policyNos = [policy.policyNo];
        policyIds = [policy.id];
        if (policy.asset) assetNo = policy.asset.assetNo;
        const relatedClaims = db.data!.claims.filter(c => c.policyId === policy.id);
        claimNos = relatedClaims.map(c => c.claimNo);
        claimIds = relatedClaims.map(c => c.id);
      }
    }

    if (!asset && policyNos.length === 0) {
      const claim = await claimService.getClaimByNo(key);
      if (claim) {
        claimNos = [claim.claimNo];
        claimIds = [claim.id];
        if (claim.policy?.policyNo) { policyNos = [claim.policy.policyNo]; }
        if (claim.policy?.id) { policyIds = [claim.policy.id]; }
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

    const materials = db.data!.materials
      .filter(m => claimIds.includes(m.claimId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const approvalNodes = db.data!.claimApprovalNodes
      .filter(n => claimIds.includes(n.claimId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const policiesData = await Promise.all(policyNos.map(p => policyService.getPolicyByNo(p)));
    const claimsData = await Promise.all(claimNos.map(c => claimService.getClaimByNo(c)));
    const assetData = assetNo ? await assetService.getAssetByNo(assetNo) : null;

    const claimsMap = new Map(claimsData.filter(Boolean).map((c: any) => [c.id, c]));
    const policiesMap = new Map(policiesData.filter(Boolean).map((p: any) => [p.id, p]));
    const claimsByNo = new Map(claimsData.filter(Boolean).map((c: any) => [c.claimNo, c]));

    const events: TimelineEvent[] = [];

    if (assetData) {
      events.push({
        time: assetData.createdAt, category: 'asset', action: 'create',
        actionLabel: '资产创建', operator: assetData.operator,
        detail: `${assetData.company} / ${assetData.assetType} / ${assetData.assetName}（编号 ${assetData.assetNo}，原值 ${assetData.originalValue}）`,
        ref: {}
      });
    }

    for (const p of policiesData.filter(Boolean) as any[]) {
      events.push({
        time: p.createdAt, category: 'policy', action: 'register_policy',
        actionLabel: p.remarks?.startsWith('续保自') ? '保单续保' : '投保登记',
        amount: Number(p.premium),
        detail: `保单 ${p.policyNo} ${p.insuranceCompany}，保费 ${p.premium}，保额 ${p.insuranceAmount}，期限 ${p.effectiveDate || p.startDate} ~ ${p.expiryDate || p.endDate}${p.remarks ? ` (${p.remarks})` : ''}`,
        ref: { policyNo: p.policyNo }
      });
    }

    for (const c of claimsData.filter(Boolean) as any[]) {
      events.push({
        time: c.createdAt, category: 'claim', action: 'create_claim',
        actionLabel: '理赔提交', operator: c.applicant,
        amount: Number(c.claimedAmount),
        detail: `理赔 ${c.claimNo}：${c.accidentDescription}，索赔 ${c.claimedAmount}`,
        ref: { claimNo: c.claimNo }
      });
    }

    for (const n of approvalNodes) {
      let action = 'review_claim';
      if (n.action === 'submit') action = 'create_claim';
      else if (n.action === 'resubmit') action = 'resubmit_claim';
      else if (n.action === 'start_review') action = n.step === 2 ? 'start_l1_review' : (n.step === 3 ? 'start_l2_review' : 'review_claim');
      else if (n.action === 'pass') {
        if (n.step === 2) action = 'pass_l1_review';
        else if (n.step === 3) action = 'pass_l2_review';
        else if (n.step === 4) action = 'confirm_settlement';
        else action = 'pass_l1_review';
      } else if (n.action === 'supplement') action = 'request_supplement';
      else if (n.action === 'approve') action = 'approve_claim';
      else if (n.action === 'reject') action = 'reject_claim';
      else if (n.action === 'withdraw') action = 'withdraw_claim';
      else if (n.action === 'settle') action = 'confirm_settlement';

      const claim = claimsMap.get(n.claimId);
      events.push({
        time: n.createdAt, category: 'claim', action,
        actionLabel: `${n.stepName}${n.action === 'supplement' ? '（补件退回）' : n.action === 'resubmit' ? '（重新提交）' : ''}`,
        operator: n.operator,
        status: n.result,
        amount: action === 'pass_l2' || action === 'approve' ? Number(claim?.approvedAmount || 0) :
                action === 'confirm_settlement' ? Number(claim?.approvedAmount || 0) : undefined,
        detail: `${n.stepName} - ${n.operator}${n.operatorRole ? `(${n.operatorRole})` : ''}：${n.result}${n.opinion ? `，意见：${n.opinion}` : ''}${n.attachmentUrl ? `，附件：${n.attachmentUrl}` : ''}`,
        ref: { claimNo: claim?.claimNo }
      });
    }

    for (const m of materials) {
      const claim = claimsMap.get(m.claimId);
      events.push({
        time: m.createdAt, category: 'material', action: m.fileUrl ? 'upload_material' : 'register_material',
        actionLabel: m.fileUrl ? '上传材料' : '登记材料',
        operator: m.uploader,
        detail: `${m.materialType}：${m.materialName}${m.remarks ? ` (${m.remarks})` : ''}${m.fileUrl ? `，文件：${m.fileUrl}` : '（无文件登记模式）'}`,
        ref: { claimNo: claim?.claimNo, materialId: m.id }
      });
    }

    for (const l of logs) {
      let act = l.action || l.operation;
      if (act === 'startL1Review') act = 'start_l1_review';
      else if (act === 'passL1Review') act = 'pass_l1_review';
      else if (act === 'requestSupplement') act = 'request_supplement';
      else if (act === 'confirmSettlement') act = 'confirm_settlement';
      else if (act === 'startReview') act = 'start_review';
      else if (act === 'generateRenewalList') act = 'generate_renewal_list';

      if (['create', 'update', 'register_policy', 'renew_policy', 'renew', 'create_claim',
           'review_claim', 'approve_claim', 'approve', 'reject_claim', 'reject', 'withdraw_claim', 'withdraw',
           'resubmit_claim', 'resubmit', 'upload_material', 'upload', 'register_material',
           'start_l1_review', 'pass_l1_review', 'request_supplement',
           'pass_l2_review', 'confirm_settlement', 'start_review',
           'createReminderTask', 'updateReminderTask', 'deleteReminderTask',
           'runReminderTask', 'runAllReminderTasks', 'createReceiver',
           'updateReceiver', 'deleteReceiver', 'registerSystem', 'updateSystem',
           'retry', 'retryAll', 'ack', 'updatePolicy', 'generate_renewal_list',
           'delete', 'register_policy', 'renew_policy'].includes(act || '')) continue;

      events.push({
        time: l.createdAt, category: 'log', action: act || 'log_operation',
        actionLabel: this.label(act || ''), operator: l.operator,
        detail: `${l.businessType || ''} ${act || ''}${l.detail || l.remarks ? `：${l.detail || l.remarks}` : ''}`,
        ref: { logId: l.id }
      });
    }

    for (const s of syncRecords) {
      const syncName = (SYNC_TYPE_NAMES as any)[s.syncType] || s.syncType;
      let bizStatus: string | undefined;
      if (s.syncType?.startsWith('claim_')) bizStatus = claimsByNo.get(s.businessKey)?.status;
      else if (s.syncType?.startsWith('policy_')) {
        const pol = [...policiesMap.values()].find((p: any) => p.policyNo === s.businessKey);
        bizStatus = (pol as any)?.status;
      }
      const triStatus = [
        `推送:${s.status}`,
        s.externalAckStatus && s.externalAckStatus !== 'pending' ? `回执:${s.externalAckStatus}` : null,
        bizStatus ? `业务:${bizStatus}` : null
      ].filter(Boolean).join(' / ');
      (s as any).retriesLeft = s.status === 'waiting_retry' ? Math.max(0, (s.maxRetry || 0) - (s.retryCount || 0)) : 0;
      (s as any).businessFinalStatus = bizStatus;
      events.push({
        time: s.createdAt, category: 'sync', action: s.syncType,
        actionLabel: `对外同步：${syncName}`,
        status: triStatus,
        detail: `推送到 ${s.targetSystem}${s.httpStatus ? `，HTTP ${s.httpStatus}` : ''}${s.requestDurationMs ? `，耗时 ${s.requestDurationMs}ms` : ''}${s.errorMessage ? `，错误：${s.errorMessage}` : ''}${s.retryCount ? `（第 ${s.retryCount}/${s.maxRetry} 次）` : ''}${s.externalAckResult ? `；对方回执：${s.externalAckResult}` : ''}${bizStatus ? `；当前业务状态：${bizStatus}` : ''}`,
        ref: { syncRecordId: s.id }
      });
    }

    events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    return {
      asset: assetData || undefined,
      policies: policiesData.filter(Boolean) as any[],
      claims: claimsData.filter(Boolean) as any[],
      logs,
      syncRecords,
      materials,
      timeline: events
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
