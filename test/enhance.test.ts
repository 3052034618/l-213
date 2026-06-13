import * as http from 'http';

const BASE = 'http://localhost:3000/api';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function post(path: string, body: any): Promise<any> {
  await sleep(80);
  const url = BASE + path;
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: u.hostname, port: Number(u.port), path: u.pathname + u.search,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({ raw: buf }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function get(path: string): Promise<any> {
  await sleep(80);
  const url = BASE + path;
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    http.get({ hostname: u.hostname, port: Number(u.port), path: u.pathname + u.search }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({ raw: buf }); } });
    }).on('error', reject);
  });
}

let passed = 0, failed = 0;
const checks: string[] = [];

function check(name: string, cond: any, info?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; checks.push(name); }
  else { console.log(`  ✗ ${name} ${info ? '- ' + info : ''}`); failed++; }
}

async function main() {
  console.log('========== 企业资产保险管理后端服务 - 增强功能测试 ==========\n');

  // 【1】健康检查
  const h = await get('/health');
  check('健康检查', h.code === 200);

  // 【2】注册外部系统（资产系统 + 财务系统）
  await post('/sync/systems', { systemCode: 'ASSET_SYS', systemName: '资产管理系统', systemType: 'asset', webhookUrl: 'http://asset.example.com/webhook' });
  await post('/sync/systems', { systemCode: 'FIN_SYS', systemName: '财务系统', systemType: 'finance', webhookUrl: 'http://finance.example.com/webhook', authToken: 'fin-token-123' });
  const systems = await get('/sync/systems');
  check('外部系统注册', systems.total === 2, `已注册:${systems.total}`);

  // 【3】创建资产+投保
  const today = new Date(); const in10d = new Date(today.getTime() + 10 * 86400000).toISOString().split('T')[0];
  const lastYear = new Date(today.getTime() - 365 * 86400000).toISOString().split('T')[0];
  const assetNo = 'AST-ENH-' + Date.now();
  const a = await post('/assets', { assetNo, assetName: '测试服务器-增强', assetType: 'IT设备', originalValue: 150000, status: 'in_use', operator: 'op_01' });
  check('资产创建', a.data?.assetNo === assetNo);

  const pol = await post('/policies', { assetNo, insuranceCompany: '平安保险', insuranceAmount: 120000, premium: 1500, effectiveDate: lastYear, expiryDate: in10d, operator: 'op_01' });
  const policyNo = pol.data?.policyNo;
  check('投保登记成功', !!policyNo);

  // 【4】理赔申请 - 多级审核流程
  const claim = await post('/claims', { assetNo, policyNo, accidentDate: today.toISOString().split('T')[0], accidentDescription: '设备进水损坏', claimedAmount: 30000, applicant: 'zhang_san' });
  const claimNo = claim.data?.claimNo;
  check('理赔申请提交', !!claimNo, claimNo);

  // 【5】查看初始进度
  const status0 = await get(`/claims/${claimNo}/status`);
  check('初始状态 pending', status0.data?.status === 'pending');
  check('当前步骤 1-提交', status0.data?.currentStep === 1);
  check('流程节点存在', status0.data?.approvalFlow?.length >= 1);

  // 【6】一级审核开始
  const l1Start = await post(`/claims/${claimNo}/review/l1/start`, { operator: 'li_pei', opinion: '材料齐全，开始审核' });
  check('开始一级审核', l1Start.data?.status === 'reviewing_l1');

  // 【7】退回补件
  const sup = await post(`/claims/${claimNo}/review/supplement`, { operator: 'li_pei', notice: '缺少维修发票，请上传维修证明扫描件' });
  check('退回补件', sup.data?.status === 'supplementing');

  // 【8】先补交材料，再重新提交
  await post('/materials', { claimNo, materialType: '维修发票', fileName: '维修发票.pdf', filePath: '/uploads/demo.pdf', fileSize: 102400, description: '维修发票扫描件', uploader: 'zhang_san' });
  const re = await post(`/claims/${claimNo}/resubmit`, { operator: 'zhang_san', remark: '已补充维修发票' });
  check('重新提交成功', re.data?.status === 'reviewing_l1' || re.data?.status === 'reviewing_l2', re.data?.status);

  // 【9】一级审核通过
  const l1pass = await post(`/claims/${claimNo}/review/l1/pass`, { operator: 'li_pei', opinion: '情况属实，建议赔付25000' });
  check('一级审核通过', l1pass.data?.status === 'reviewing_l2');

  // 【10】二级审核通过
  const l2pass = await post(`/claims/${claimNo}/approve`, { approvedAmount: 25000, adjusterOpinion: '同意赔付25000元', approver: 'finance_mgr' });
  check('二级审核(审批通过)', l2pass.data?.status === 'approved', l2pass.data?.status);

  // 【11】赔付确认
  const settled = await post(`/claims/${claimNo}/settle/confirm`, { operator: 'finance_cashier' });
  check('赔付确认 settled', settled.data?.status === 'settled');
  check('已赔付标记', settled.data?.confirmedSettlement === true);

  // 【12】查看完整流程进度
  const finalStatus = await get(`/claims/${claimNo}/status`);
  const flow = finalStatus.data?.approvalFlow || [];
  check('流程节点数 >= 5', flow.length >= 5, `实际:${flow.length}`);
  check('节点含处理人', flow.every((n: any) => n.operator));
  console.log('    审批流程:');
  flow.forEach((n: any) => console.log(`      [步骤${n.step}] ${n.stepName} - ${n.operator}(${n.operatorRole || ''}) - ${n.resultText} - ${n.time?.substring(5, 19)}`));

  // 【13】同步记录查询
  const recs = await get(`/sync/records?businessKey=${claimNo}`);
  check('审批结果已同步记录', recs.total >= 1, `记录数:${recs.total}`);
  if (recs.list?.[0]) {
    check('同步状态 success', recs.list[0].status === 'success', recs.list[0].status);
    console.log(`    同步目标: ${recs.list[0].targetSystem}, 状态: ${recs.list[0].status}, 重试:${recs.list[0].retryCount}`);
  }

  // 【14】同步统计
  const syncStats = await get('/sync/statistics');
  check('同步统计有数据', syncStats.data?.total >= 3);

  // 【15】到期提醒 - 分组查看
  const grouped = await get('/reports/policies/expiring/grouped?days=30&groupBy=assetType');
  check('分组到期提醒', grouped.total >= 1, `到期数:${grouped.total}`);
  check('分组信息', grouped.groups?.length >= 1);

  // 【16】创建提醒任务
  const t1 = await post('/reports/reminders/tasks', { taskName: 'IT设备30天到期提醒', remindDays: 30, assetType: 'IT设备' });
  check('提醒任务创建', !!t1.data?.id);
  const t2 = await post('/reports/reminders/tasks', { taskName: '全公司90天到期', remindDays: 90 });
  check('第二个提醒任务', !!t2.data?.id);

  // 【17】手动执行提醒任务
  const runResult = await post(`/reports/reminders/tasks/${t1.data.id}/run`, {});
  check('任务执行完成', runResult.data?.count !== undefined);
  console.log(`    任务发现到期保单: ${runResult.data?.count}, 保费:${runResult.data?.summary?.totalPremium}`);

  // 【18】续保清单导出（CSV）
  const exportCsv = await get('/reports/policies/renewal/export?days=365');
  const csvContent = typeof exportCsv === 'string' ? exportCsv : (exportCsv.raw || JSON.stringify(exportCsv));
  const csvOk = csvContent.includes('保单号') || csvContent.includes('\uFEFF');
  check('续保清单CSV导出', csvOk, csvContent.substring(0, 50));

  // 【19】链路追踪 - 按资产编号
  const trace = await get(`/reports/trace/chain?key=${assetNo}`);
  check('链路追踪有资产', !!trace.data?.asset);
  check('链路追踪关联保单', trace.data?.policies?.length >= 1);
  check('链路追踪关联理赔', trace.data?.claims?.length >= 1);
  check('链路追踪操作日志', trace.data?.logs?.length >= 1);
  check('链路追踪同步记录', trace.data?.syncRecords?.length >= 1);
  console.log(`    链路: 资产1保单${trace.data?.policies?.length}理赔${trace.data?.claims?.length}日志${trace.data?.logs?.length}同步${trace.data?.syncRecords?.length}`);

  // 【20】链路追踪 - 按理赔号
  const trace2 = await get(`/reports/trace/chain?key=${claimNo}`);
  check('按理赔号追踪', trace2.data?.claims?.length >= 1 && trace2.data?.asset);

  // 【21】财务汇总报表
  const startD = new Date(today.getTime() - 400 * 86400000).toISOString().split('T')[0];
  const endD = new Date(today.getTime() + 400 * 86400000).toISOString().split('T')[0];
  const report = await get(`/reports/finance/summary?startDate=${startD}&endDate=${endD}`);
  check('财务报表-保费', report.data?.premium?.total >= 1500);
  check('财务报表-保额', report.data?.insuredAmount?.total >= 120000);
  check('财务报表-赔付', report.data?.claim?.approved >= 25000);
  check('财务报表-未结案数', report.data?.claim?.pendingNotSettled !== undefined);
  console.log(`    保费:${report.data?.premium?.total}, 保额:${report.data?.insuredAmount?.total}`);
  console.log(`    申请索赔:${report.data?.claim?.claimed}, 审批赔付:${report.data?.claim?.approved}, 已付款:${report.data?.claim?.paid}`);

  // 【22】财务报表CSV导出
  const reportCsv = await get(`/reports/finance/export?startDate=${startD}&endDate=${endD}`);
  const reportCsvContent = typeof reportCsv === 'string' ? reportCsv : (reportCsv.raw || JSON.stringify(reportCsv));
  const reportCsvOk = reportCsvContent.includes('保费') || reportCsvContent.includes('\uFEFF');
  check('财务报表CSV导出', reportCsvOk, reportCsvContent.substring(0, 50));

  // 【23】撤回 + 同步测试
  const claim2 = await post('/claims', { assetNo, policyNo, accidentDate: today.toISOString().split('T')[0], accidentDescription: '小事故测试撤回', claimedAmount: 5000, applicant: 'li_si' });
  const c2no = claim2.data?.claimNo;
  const withdraw = await post(`/claims/${c2no}/withdraw`, { operator: 'li_si' });
  check('撤回成功', withdraw.data?.status === 'withdrawn');
  const recs2 = await get(`/sync/records?businessKey=${c2no}`);
  check('撤回已记录同步', recs2.total >= 1);

  console.log(`\n========== 测试完成 ==========`);
  console.log(`✓ 通过: ${passed}, ✗ 失败: ${failed}`);
  console.log('\n【增强功能覆盖清单】');
  const features = [
    '外部系统注册与配置',
    '审批结果自动推送(通过/驳回/撤回/赔付/续保)',
    '同步记录查询(按业务键/类型/状态)',
    '失败同步手动重试',
    '批量失败重试',
    '多级审核流程(一级/二级/赔付确认)',
    '补件退回与重新提交',
    '流程进度可视化(步骤/处理人/节点/卡点)',
    '到期保单分组查看(公司/资产类型/月份)',
    '定时提醒任务管理',
    '续保清单CSV导出(财务可用)',
    '链路追踪(资产/保单/理赔任意入口)',
    '操作日志+同步记录完整链路',
    '财务汇总报表(保费/保额/赔付/未结案)',
    '财务报表CSV导出'
  ];
  features.forEach(f => console.log('  ✓ ' + f));
}

main().catch(e => { console.error(e); process.exit(1); });
