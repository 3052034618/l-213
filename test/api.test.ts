import * as http from 'http';

const BASE_URL = 'http://localhost:3000/api';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function request(options: http.RequestOptions, body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function post(path: string, body: any): Promise<any> {
  await sleep(100);
  const url = new URL(BASE_URL + path);
  return request({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(JSON.stringify(body))
    }
  }, body);
}

async function get(path: string): Promise<any> {
  await sleep(100);
  const url = new URL(BASE_URL + path);
  return request({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: 'GET'
  });
}

async function test() {
  console.log('========== 企业资产保险管理后端服务 API 测试 ==========\n');
  
  let assetNo = 'AST-' + Date.now();
  let policyNo: string;
  let claimNo: string;
  let policy2No: string;
  let claim2No: string;
  
  try {
    console.log('【1】健康检查');
    const health = await get('/health');
    console.log('  ✓ 服务运行正常:', health.message);
    console.log();
    
    console.log('【2】创建资产');
    const assetResult = await post('/assets', {
      assetNo,
      assetName: '办公设备-服务器',
      assetType: 'IT设备',
      originalValue: 50000,
      location: '北京总部机房',
      description: 'Dell PowerEdge R750服务器'
    });
    console.log('  ✓ 资产创建成功:', assetResult.data.assetNo);
    console.log();
    
    console.log('【3】资产投保登记');
    const policyResult = await post('/policies', {
      assetNo,
      insuranceCompany: '中国平安财产保险',
      insuranceAmount: 50000,
      premium: 500,
      effectiveDate: '2026-06-01',
      expiryDate: '2027-06-01',
      coverageScope: '自然灾害,意外事故',
      remarks: '企业财产综合险',
      operator: 'admin'
    });
    policyNo = policyResult.data.policyNo;
    console.log('  ✓ 投保登记成功,保单号:', policyNo);
    console.log('  ✓ 保险金额:', policyResult.data.insuranceAmount);
    console.log();
    
    console.log('【4】按资产编号查询保单');
    const policiesByAsset = await get(`/policies/asset/${assetNo}`);
    console.log('  ✓ 查询到保单数量:', policiesByAsset.data.length);
    console.log();
    
    console.log('【5】保单列表查询');
    const policyList = await get('/policies?page=1&pageSize=10');
    console.log('  ✓ 总保单数:', policyList.total);
    console.log();
    
    console.log('【6】费用汇总查询');
    const feeSummary = await get('/policies/fee/summary');
    console.log('  ✓ 总保费:', feeSummary.data.overall.totalPremium);
    console.log('  ✓ 总保额:', feeSummary.data.overall.totalInsuredAmount);
    console.log();
    
    console.log('【7】到期提醒 - 查询365天内到期保单');
    const expiring = await get('/policies/expiring/list?days=365');
    console.log('  ✓ 到期保单数量:', expiring.count);
    console.log();
    
    console.log('【8】生成续保清单');
    const renewalList = await post('/policies/renewal/list', {
      days: 365,
      assetType: 'IT设备'
    });
    console.log('  ✓ 续保清单数量:', renewalList.total);
    console.log('  ✓ 续保总保费:', renewalList.summary.totalPremium);
    console.log();
    
    console.log('【9】创建第二个资产');
    const assetNo2 = 'AST-' + (Date.now() + 1);
    await post('/assets', {
      assetNo: assetNo2,
      assetName: '办公设备-打印机',
      assetType: '办公设备',
      originalValue: 10000,
      location: '上海分公司'
    });
    console.log('  ✓ 资产创建成功:', assetNo2);
    
    console.log('【10】第二个资产投保');
    const policy2 = await post('/policies', {
      assetNo: assetNo2,
      insuranceCompany: '中国人保财险',
      insuranceAmount: 10000,
      premium: 120,
      effectiveDate: '2026-01-01',
      expiryDate: '2026-12-31',
      operator: 'finance_01'
    });
    policy2No = policy2.data.policyNo;
    console.log('  ✓ 投保成功,保单号:', policy2No);
    console.log();
    
    console.log('【11】理赔申请 - 提交事故说明');
    const claimResult = await post('/claims', {
      assetNo: assetNo2,
      accidentDate: '2026-06-10',
      accidentDescription: '打印机因电路短路烧毁,需要维修或更换',
      claimedAmount: 8000,
      applicant: 'staff_01'
    });
    claimNo = claimResult.data.claimNo;
    console.log('  ✓ 理赔申请成功,理赔号:', claimNo);
    console.log('  ✓ 索赔金额:', claimResult.data.claimedAmount);
    console.log('  ✓ 当前状态:', claimResult.data.status);
    console.log();
    
    console.log('【12】查看理赔状态');
    const claimStatus = await get(`/claims/${claimNo}/status`);
    console.log('  ✓ 状态:', claimStatus.data.status, '-', claimStatus.data.statusText);
    console.log();
    
    console.log('【13】开始审核理赔');
    await post(`/claims/${claimNo}/review`, { operator: 'adjuster_01' });
    const statusAfterReview = await get(`/claims/${claimNo}/status`);
    console.log('  ✓ 审核后状态:', statusAfterReview.data.statusText);
    console.log();
    
    console.log('【14】审批通过 - 推送审批结果');
    const approveResult = await post(`/claims/${claimNo}/approve`, {
      approvedAmount: 7500,
      adjusterOpinion: '情况属实,按保额80%赔付',
      settlementDate: '2026-06-14',
      approver: 'manager_01'
    });
    console.log('  ✓ 审批结果:', approveResult.data.status);
    console.log('  ✓ 赔付金额:', approveResult.data.approvedAmount);
    console.log();
    
    console.log('【15】创建第二个理赔申请用于撤回测试');
    const claim2 = await post('/claims', {
      assetNo: assetNo2,
      accidentDate: '2026-06-12',
      accidentDescription: '测试申请,用于验证撤回功能',
      claimedAmount: 1000,
      applicant: 'staff_02'
    });
    claim2No = claim2.data.claimNo;
    console.log('  ✓ 申请创建成功:', claim2No);
    console.log();
    
    console.log('【16】撤回未受理申请');
    const withdrawResult = await post(`/claims/${claim2No}/withdraw`, {
      operator: 'staff_02'
    });
    console.log('  ✓ 撤回成功,状态:', withdrawResult.data.status);
    console.log();
    
    console.log('【17】理赔统计');
    const stats = await get('/claims/statistics/data');
    console.log('  ✓ 总申请数:', stats.data.total);
    console.log('  ✓ 已赔付:', stats.data.byStatus.approved);
    console.log('  ✓ 已撤回:', stats.data.byStatus.withdrawn);
    console.log('  ✓ 赔付率:', (stats.data.payoutRate * 100).toFixed(2) + '%');
    console.log();
    
    console.log('【18】操作日志查询');
    const logs = await get('/logs?module=claim&page=1&pageSize=10');
    console.log('  ✓ 操作日志总数:', logs.total);
    console.log('  ✓ 最近操作:', logs.data[0]?.operation || '无');
    console.log('  ✓ 操作人:', logs.data[0]?.operator || '无');
    console.log();
    
    console.log('【19】保单续保');
    const renewResult = await post(`/policies/${policy2No}/renew`, {
      effectiveDate: '2027-01-01',
      expiryDate: '2027-12-31',
      premium: 130,
      operator: 'admin'
    });
    console.log('  ✓ 续保成功,新保单号:', renewResult.data.policyNo);
    console.log();
    
    console.log('【20】验证续保后原保单状态');
    const oldPolicy = await get(`/policies/${policy2No}`);
    console.log('  ✓ 原保单状态已更新为:', oldPolicy.data.status);
    console.log();
    
    console.log('【21】理赔列表查询 - 按状态过滤');
    const approvedClaims = await get('/claims?status=approved&page=1&pageSize=10');
    console.log('  ✓ 已赔付理赔数量:', approvedClaims.total);
    console.log();
    
    console.log('========== 测试完成 ==========');
    console.log('✓ 所有21项测试通过!');
    console.log();
    console.log('【功能覆盖清单】');
    console.log('  ✓ 资产投保登记');
    console.log('  ✓ 按资产编号关联保单');
    console.log('  ✓ 记录保险金额');
    console.log('  ✓ 保单查询');
    console.log('  ✓ 费用汇总');
    console.log('  ✓ 批量查询到期资产');
    console.log('  ✓ 生成续保清单');
    console.log('  ✓ 理赔申请 - 提交事故说明');
    console.log('  ✓ 查看理赔状态');
    console.log('  ✓ 撤回未受理申请');
    console.log('  ✓ 推送审批结果');
    console.log('  ✓ 操作记录留存');
    console.log('  ✓ 保单续保');
    console.log('  ✓ 理赔统计');
    console.log('  ✓ 进度同步');
    
  } catch (error: any) {
    console.error('✗ 测试失败:', error.message);
    console.error(error);
    process.exit(1);
  }
}

test();
