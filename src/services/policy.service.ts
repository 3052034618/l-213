import { getDb, nextId, now, InsurancePolicy } from '../config/database';
import { CreatePolicyDto, QueryPolicyDto, RenewalQueryDto } from '../dto/policy.dto';
import { generatePolicyNo, getDaysDifference } from '../utils/dateUtils';
import { assetService } from './asset.service';
import { syncService } from './sync.service';

export class PolicyService {
  async createPolicy(dto: CreatePolicyDto): Promise<InsurancePolicy> {
    const db = getDb();
    const asset = await assetService.getAssetByNo(dto.assetNo);
    if (!asset) {
      throw new Error(`资产编号 ${dto.assetNo} 不存在`);
    }

    const activePolicy = db.data!.policies.find(
      p => p.assetId === asset.id && p.status === 'active'
    );
    if (activePolicy) {
      throw new Error(`该资产已有有效保单: ${activePolicy.policyNo}`);
    }

    const policy: InsurancePolicy = {
      id: nextId('policyId'),
      policyNo: generatePolicyNo(),
      assetId: asset.id,
      insuranceCompany: dto.insuranceCompany,
      insuranceAmount: dto.insuranceAmount,
      premium: dto.premium,
      effectiveDate: dto.effectiveDate,
      expiryDate: dto.expiryDate,
      coverageScope: dto.coverageScope,
      status: 'active',
      remarks: dto.remarks,
      operator: dto.operator,
      createdAt: now(),
      updatedAt: now(),
      asset
    };
    db.data!.policies.push(policy);
    await db.write();
    return policy;
  }

  async getPolicyByNo(policyNo: string): Promise<InsurancePolicy | null> {
    const db = getDb();
    const policy = db.data!.policies.find(p => p.policyNo === policyNo);
    if (policy) {
      const asset = await assetService.getAssetById(policy.assetId);
      return { ...policy, asset: asset || undefined };
    }
    return null;
  }

  async getPoliciesByAssetNo(assetNo: string): Promise<InsurancePolicy[]> {
    const db = getDb();
    const asset = await assetService.getAssetByNo(assetNo);
    if (!asset) {
      return [];
    }
    const policies = db.data!.policies
      .filter(p => p.assetId === asset.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return policies.map(p => ({ ...p, asset }));
  }

  async queryPolicies(dto: QueryPolicyDto): Promise<{ list: InsurancePolicy[]; total: number }> {
    const db = getDb();
    const page = dto.page || 1;
    const pageSize = dto.pageSize || 20;
    
    let filtered = [...db.data!.policies];
    
    if (dto.assetNo) {
      const asset = await assetService.getAssetByNo(dto.assetNo);
      if (asset) {
        filtered = filtered.filter(p => p.assetId === asset.id);
      } else {
        return { list: [], total: 0 };
      }
    }
    if (dto.policyNo) filtered = filtered.filter(p => p.policyNo === dto.policyNo);
    if (dto.status) filtered = filtered.filter(p => p.status === dto.status);
    
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    const total = filtered.length;
    const list = await Promise.all(
      filtered.slice((page - 1) * pageSize, page * pageSize)
        .map(async p => ({ ...p, asset: await assetService.getAssetById(p.assetId) || undefined }))
    );
    
    return { list, total };
  }

  async getExpiringPolicies(days: number): Promise<InsurancePolicy[]> {
    const db = getDb();
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    const nowStr = now.toISOString().split('T')[0];
    const futureStr = futureDate.toISOString().split('T')[0];

    const policies = db.data!.policies.filter(p => 
      p.status === 'active' && 
      p.expiryDate >= nowStr && 
      p.expiryDate <= futureStr
    ).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

    return Promise.all(
      policies.map(async p => ({ ...p, asset: await assetService.getAssetById(p.assetId) || undefined }))
    );
  }

  async generateRenewalList(dto: RenewalQueryDto): Promise<{ list: any[]; total: number; summary: any }> {
    const policies = await this.getExpiringPolicies(dto.days);
    let filtered = policies;
    
    if (dto.assetType) {
      filtered = policies.filter(p => p.asset?.assetType === dto.assetType);
    }

    const list = filtered.map(p => ({
      policyNo: p.policyNo,
      assetNo: p.asset!.assetNo,
      assetName: p.asset!.assetName,
      assetType: p.asset!.assetType,
      company: p.asset?.company || '（未归属）',
      insuranceCompany: p.insuranceCompany,
      insuranceAmount: p.insuranceAmount,
      currentPremium: p.premium,
      effectiveDate: p.effectiveDate,
      expiryDate: p.expiryDate,
      daysToExpiry: getDaysDifference(new Date().toISOString().split('T')[0], p.expiryDate)
    }));

    const totalPremium = list.reduce((sum, p) => sum + Number(p.currentPremium), 0);
    const totalAmount = list.reduce((sum, p) => sum + Number(p.insuranceAmount), 0);

    return {
      list,
      total: list.length,
      summary: {
        totalPolicies: list.length,
        totalPremium,
        totalAmount
      }
    };
  }

  async getFeeSummary(): Promise<any> {
    const db = getDb();
    const allPolicies = db.data!.policies;
    
    const byCompanyMap = new Map<string, { totalPolicies: number; totalPremium: number; totalInsuredAmount: number }>();
    
    for (const policy of allPolicies) {
      const key = `${policy.status}|${policy.insuranceCompany}`;
      const existing = byCompanyMap.get(key) || { totalPolicies: 0, totalPremium: 0, totalInsuredAmount: 0 };
      existing.totalPolicies++;
      existing.totalPremium += Number(policy.premium);
      existing.totalInsuredAmount += Number(policy.insuranceAmount);
      byCompanyMap.set(key, existing);
    }

    const byCompany = Array.from(byCompanyMap.entries()).map(([key, value]) => {
      const [status, insuranceCompany] = key.split('|');
      return {
        status,
        insuranceCompany,
        ...value
      };
    });

    const overallTotalPremium = allPolicies.reduce((sum, p) => sum + Number(p.premium), 0);
    const overallTotalAmount = allPolicies.reduce((sum, p) => sum + Number(p.insuranceAmount), 0);

    return {
      overall: {
        totalPolicies: allPolicies.length,
        totalPremium: overallTotalPremium,
        totalInsuredAmount: overallTotalAmount
      },
      byCompany
    };
  }

  async renewPolicy(policyNo: string, effectiveDate: string, expiryDate: string, premium: number, operator: string): Promise<InsurancePolicy> {
    const db = getDb();
    const oldPolicy = await this.getPolicyByNo(policyNo);
    if (!oldPolicy) {
      throw new Error(`保单 ${policyNo} 不存在`);
    }

    const oldIndex = db.data!.policies.findIndex(p => p.policyNo === policyNo);
    db.data!.policies[oldIndex].status = 'renewed';
    db.data!.policies[oldIndex].updatedAt = now();

    const newPolicy: InsurancePolicy = {
      id: nextId('policyId'),
      policyNo: generatePolicyNo(),
      assetId: oldPolicy.assetId,
      insuranceCompany: oldPolicy.insuranceCompany,
      insuranceAmount: oldPolicy.insuranceAmount,
      premium,
      effectiveDate,
      expiryDate,
      coverageScope: oldPolicy.coverageScope,
      status: 'active',
      remarks: `续保自保单 ${policyNo}`,
      operator,
      createdAt: now(),
      updatedAt: now(),
      asset: oldPolicy.asset
    };
    db.data!.policies.push(newPolicy);
    await db.write();

    syncService.pushToExternalSystems('policy_renewed', newPolicy.policyNo, newPolicy).catch(() => { });
    return newPolicy;
  }

  async getExpiringPoliciesGrouped(days: number, groupBy: 'company' | 'assetType' | 'expiryMonth' = 'assetType'): Promise<any> {
    const policies = await this.getExpiringPolicies(days);
    const groups = new Map<string, any[]>();

    for (const p of policies) {
      let key = '';
      if (groupBy === 'company') key = p.asset?.company || '（未归属）';
      else if (groupBy === 'assetType') key = p.asset?.assetType || '未分类';
      else if (groupBy === 'expiryMonth') key = p.expiryDate.substring(0, 7);

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }

    const result: any[] = [];
    for (const [groupName, list] of groups.entries()) {
      const totalPremium = list.reduce((s, p) => s + Number(p.premium), 0);
      const totalAmount = list.reduce((s, p) => s + Number(p.insuranceAmount), 0);
      result.push({
        groupName,
        count: list.length,
        totalPremium,
        totalAmount,
        list: list.map(p => ({
          policyNo: p.policyNo,
          assetNo: p.asset?.assetNo,
          assetName: p.asset?.assetName,
          assetType: p.asset?.assetType,
          insuranceCompany: p.insuranceCompany,
          insuranceAmount: p.insuranceAmount,
          premium: p.premium,
          effectiveDate: p.effectiveDate,
          expiryDate: p.expiryDate,
          daysToExpiry: getDaysDifference(new Date().toISOString().split('T')[0], p.expiryDate)
        }))
      });
    }

    result.sort((a, b) => b.count - a.count);
    return { groups: result, total: policies.length, groupBy };
  }
}

export const policyService = new PolicyService();
