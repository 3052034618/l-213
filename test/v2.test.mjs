import http from 'node:http';

const PORT = 3000;
const HOST = '127.0.0.1';

function request(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: '/api' + path,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      agent: new http.Agent({ keepAlive: false })
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const ct = res.headers['content-type'] || '';
        if (ct.includes('application/json') || data.trimStart().startsWith('{') || data.trimStart().startsWith('[')) {
          try { resolve({ status: res.statusCode, body: JSON.parse(data), raw: data }); return; }
          catch {}
        }
        resolve({ status: res.statusCode, body: data, raw: data });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('TIMEOUT')); });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

let passed = 0, failed = 0;
function assert(name, cond, info = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${info ? ': ' + info : ''}`); }
  else {
    failed++;
    const extra = globalThis._dbg ? `\n    [DBG] ${JSON.stringify(globalThis._dbg).slice(0, 300)}` : '';
    console.log(`  ✗ ${name}${info ? ': ' + info : ''}${extra}`);
  }
}

async function main() {
  console.log('========== 企业资产保险管理 - 协同增强V2 测试 ==========\n');

  console.log('【1】健康检查');
  const h = await request('/health');
  assert('服务运行正常', h.body?.code === 200);

  console.log('\n【2】外部系统 + Webhook 测试');
  const bad = await request('/sync/systems', 'POST', { systemCode: 'BAD', systemName: 'bad', systemType: 'x', webhookUrl: 'not-url' });
  assert('无效 URL 被拦截', bad.body?.code === 400, bad.body?.message);

  const sysCode = 'SYS' + Date.now();
  const sys = await request('/sync/systems', 'POST', {
    systemCode: sysCode, systemName: '测试财务', systemType: 'finance',
    webhookUrl: 'https://httpbin.org/status/200', authToken: 't1'
  });
  const sid = sys.body?.data?.id;
  assert('系统注册成功', sys.body?.code === 200 && sid, sid);

  const t1 = await request(`/sync/systems/${sid}/test`, 'POST');
  assert('连通性测试-接口正常返回', t1.body?.code === 200);
  assert('连通性测试-成功', t1.body?.data?.success === true, `HTTP=${t1.body?.data?.httpStatus} duration=${t1.body?.data?.durationMs}ms`);

  await request(`/sync/systems/${sid}`, 'PUT', { webhookUrl: 'https://httpbin.org/status/500' });
  const t2 = await request(`/sync/systems/${sid}/test`, 'POST');
  assert('500地址被识别为失败', t2.body?.data?.success === false, t2.body?.data?.message);

  await request(`/sync/systems/${sid}`, 'PUT', { webhookUrl: 'https://httpbin.org/post' });

  console.log('\n【3】创建资产、投保、理赔审核全流程');
  const aNo = 'AST-V2-' + Date.now();
  const ast = await request('/assets', 'POST', { assetNo: aNo, assetName: 'V2 笔记本', assetType: 'IT设备', company: '集团', originalValue: 15000, operator: 'alice' });
  assert('资产创建成功', ast.body?.code === 200, aNo);

  const pol = await request('/policies/', 'POST', { assetNo: aNo, insuranceCompany: '平安', insuranceAmount: 15000, premium: 800, effectiveDate: '2025-06-01', expiryDate: '2026-06-30', operator: 'alice' });
  globalThis._dbg = { pol_status: pol.status, pol_body: pol.body };
  const pNo = pol.body?.data?.policyNo;
  assert('投保登记成功', pol.body?.code === 200, pNo);

  const clm = await request('/claims/', 'POST', { assetNo: aNo, accidentDate: '2026-06-10', accidentDescription: 'V2测试损坏', claimedAmount: 8000, applicant: 'bob' });
  const cNo = clm.body?.data?.claimNo;
  globalThis._dbg = { clm_status: clm.status, clm_body: clm.body };
  assert('理赔申请成功', clm.body?.code === 200, cNo);

  await request(`/claims/${cNo}/review/l1/start`, 'POST', { operator: 'l1_u', opinion: '受理' });
  await request(`/claims/${cNo}/review/l1/pass`, 'POST', { operator: 'l1_u', opinion: 'L1过' });
  const approved = await request(`/claims/${cNo}/approve`, 'POST', { approver: 'l2_u', approvedAmount: 7200, adjusterOpinion: 'L2过' });
  globalThis._dbg = { approved_status: approved.status, approved_body: approved.body };
  assert('审批通过', approved.body?.code === 200, `状态=${approved.body?.data?.status}`);

  await new Promise(r => setTimeout(r, 7000));
  const recs = await request(`/sync/records?businessKey=${cNo}`);
  assert('审批同步记录存在', recs.body?.total >= 1, `共${recs.body?.total}条`);
  const pushRec = recs.body?.list?.[0];
  if (pushRec) {
    console.log(`    同步记录: status=${pushRec.status} HTTP=${pushRec.httpStatus ?? '-'} 耗时=${pushRec.requestDurationMs ?? '-'}ms 分类=${pushRec.errorCategory ?? '-'} 重试=${pushRec.retryCount}/${pushRec.maxRetry}`);
  }

  console.log('\n【4】外部回执 - 三段式跟踪');
  if (pushRec) {
    const ack = await request(`/sync/records/${pushRec.id}/ack`, 'POST', { ackStatus: 'processed', ackResult: '已入账', ackRemark: 'PZ-001' });
    assert('回执登记成功', ack.body?.code === 200);
    const d = await request(`/sync/records/${pushRec.id}`);
    assert('详情含回执', d.body?.data?.externalAckStatus === 'processed', d.body?.data?.externalAckResult);
    assert('三段式完整', d.body?.data?.status && d.body?.data?.externalAckStatus && approved.body?.data?.status,
      `推送=${d.body?.data?.status} / 回执=${d.body?.data?.externalAckStatus} / 业务=${approved.body?.data?.status}`);
  }
  const stats = await request('/sync/statistics');
  assert('统计含 byStatus/byAckStatus', stats.body?.data?.byStatus && stats.body?.data?.byAckStatus);

  console.log('\n【5】链路追踪-时间线');
  const chain = await request(`/reports/trace/chain?key=${aNo}`);
  assert('链路成功', chain.body?.code === 200);
  assert('含 materials 和 timeline', Array.isArray(chain.body?.data?.materials) && Array.isArray(chain.body?.data?.timeline), `时间线${chain.body?.data?.timeline?.length}条`);
  const tl = chain.body?.data?.timeline || [];
  const hasReg = tl.some(e => e.action === 'register_policy');
  const hasClaim = tl.some(e => e.action === 'create_claim');
  const hasL2 = tl.some(e => e.action === 'pass_l2_review' || e.action === 'approve_claim');
  const hasSync = tl.some(e => e.category === 'sync');
  assert('投保登记在时间线', hasReg);
  assert('理赔提交在时间线', hasClaim);
  assert('审批节点在时间线', hasL2);
  assert('对外同步在时间线', hasSync);
  console.log(`    前6条正序事件：`);
  tl.slice(0, 6).forEach(e => console.log(`      [${String(e.time).slice(5,16)}] ${e.actionLabel}${e.operator ? ' - '+e.operator : ''}${e.status ? '（'+e.status+'）' : ''}`));

  console.log('\n【6】多入口链路');
  const cp = await request(`/reports/trace/chain?key=${pNo}`);
  assert('保单号入口能找到资产', !!cp.body?.data?.asset, cp.body?.data?.asset?.assetNo);
  const cc = await request(`/reports/trace/chain?key=${cNo}`);
  assert('理赔号入口能找到保单', (cc.body?.data?.policies?.length || 0) >= 1, (cc.body?.data?.policies||[]).map(p=>p.policyNo).join(','));

  console.log('\n【7】接收对象管理');
  const r1 = await request('/reports/reminders/receivers', 'POST', { name: '张主管', email: 'zh@a.com', department: '财务', categories: ['续保提醒', '理赔到账'] });
  const r2 = await request('/reports/reminders/receivers', 'POST', { name: '李专员', email: 'li@a.com', department: '资产', categories: ['续保提醒'] });
  const rid = r1.body?.data?.id;
  assert('接收对象1创建', r1.body?.code === 200, r1.body?.data?.name);
  assert('接收对象2创建', r2.body?.code === 200);
  const listR = await request('/reports/reminders/receivers?category=' + encodeURIComponent('续保提醒'));
  assert('按类别过滤', listR.body?.total >= 2, listR.body?.total);
  const upR = await request(`/reports/reminders/receivers/${rid}`, 'PUT', { phone: '13800000001', enabled: true });
  globalThis._dbg = { upR_status: upR.status, upR_body: upR.body };
  assert('更新接收对象成功', upR.body?.code === 200);

  console.log('\n【8】提醒任务 + 历史');
  const tsk = await request('/reports/reminders/tasks', 'POST', { taskName: 'V2提醒任务', remindDays: 365, receivers: ['张主管', '李专员'] });
  const tid = tsk.body?.data?.id;
  assert('任务创建-带接收人', tsk.body?.code === 200, tsk.body?.data?.receivers);
  const runT = await request(`/reports/reminders/tasks/${tid}/run`, 'POST', {});
  const batchNo = runT.body?.data?.batchNo;
  assert('任务产生批次号', !!batchNo, batchNo);
  const hist = await request('/reports/reminders/histories');
  assert('提醒历史数量>=1', hist.body?.total >= 1);
  const lastH = hist.body?.list?.[0];
  assert('历史含公司/资产类型统计', lastH?.companyDetails && lastH?.assetTypeDetails, JSON.stringify(lastH?.companyDetails || {}));
  assert('历史含批次号', lastH?.batchNo === batchNo, lastH?.batchNo);

  console.log('\n【9】续保清单CSV');
  const csvUrl = `/reports/policies/renewal/export?days=365&batchNo=${encodeURIComponent(batchNo || 'BATCH')}`;
  const csvResp = await new Promise((res, rej) => {
    http.get({ hostname: HOST, port: PORT, path: '/api' + csvUrl, headers: { 'Accept-Encoding': 'identity' } }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res({ headers: r.headers, body: d }));
    }).on('error', rej);
  });
  assert('CSV包含批次号', csvResp.body.includes(batchNo || 'BATCH'), batchNo);
  assert('CSV带BOM', csvResp.body.charCodeAt(0) === 0xFEFF);
  assert('CSV包含联系建议', csvResp.body.includes('联系建议'));
  assert('CSV Content-Disposition 文件名正确', /utf-8/i.test(csvResp.headers?.['content-disposition'] || ''), csvResp.headers?.['content-disposition']);
  console.log(`    CSV大小: ${csvResp.body.length} 字符`);

  console.log('\n【10】扩展查询 + 重试策略');
  const ackRecs = await request('/sync/records?externalAckStatus=processed');
  assert('按回执查询', ackRecs.body?.total >= 1, ackRecs.body?.total);
  const policies = await request('/sync/retry-policies');
  assert('默认重试策略已预置', policies.body?.total >= 1, policies.body?.total);
  const pid = policies.body?.data?.[0]?.id;
  if (pid) {
    const up = await request(`/sync/retry-policies/${pid}`, 'PUT', { maxRetry: 6, backoffType: 'fixed', intervalSeconds: 60 });
    assert('重试策略可配置', up.body?.code === 200, `最大重试:${up.body?.data?.maxRetry}`);
  }

  console.log('\n【11】赔付确认同步 + 回执回写');
  const settle = await request(`/claims/${cNo}/settle/confirm`, 'POST', { operator: 'cashier', settlementDate: '2026-06-14' });
  assert('赔付确认成功', settle.body?.code === 200, settle.body?.data?.status);
  await new Promise(r => setTimeout(r, 5000));
  const sr = await request(`/sync/records?syncType=claim_settled&businessKey=${cNo}`);
  assert('赔付同步记录存在', sr.body?.total >= 1, sr.body?.total);
  const srid = sr.body?.list?.[0]?.id;
  if (srid) {
    const sa = await request(`/sync/records/${srid}/ack`, 'POST', { ackStatus: 'processed', ackResult: '已到账', ackRemark: '流水号XXXX' });
    assert('赔付到账回执登记', sa.body?.code === 200);
  }

  console.log('\n【12】全链路时间线验证');
  const fc = await request(`/reports/trace/chain?key=${aNo}`);
  const acts = (fc.body?.data?.timeline || []).map(e => e.action).join(',');
  console.log(`    完整动作: ${acts}`);
  assert('含资产创建', acts.includes('create'));
  assert('含投保登记', acts.includes('register_policy'));
  assert('含理赔提交', acts.includes('create_claim'));
  assert('含一级审核', acts.includes('pass_l1_review'));
  assert('含二级审核', acts.includes('pass_l2_review') || acts.includes('approve_claim'));
  assert('含赔付确认', acts.includes('confirm_settlement'));
  assert('含审批同步', acts.includes('claim_approved'));
  assert('含赔付同步', acts.includes('claim_settled'));

  console.log('\n========== 测试完成 ==========');
  console.log(`✓ 通过: ${passed}, ✗ 失败: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('TEST FATAL:', e); process.exit(1); });
