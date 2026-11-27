const ACTION_PATHS = { query:'/v4/payment/query', refund:'/v4/payment/refund', refundQuery:'/v4/refund/query', cancel:'/v4/payment/close' };
const PAYMENT_STATUSES = ['INIT','PROCESSING','SUCCESS','FAILED','AUTH_SUCCESS','CANCEL','CLOSED'];
function identity(env, cred) { return cred.fingerprint; }
function redact(value, secrets = [], key = '') {
  if (/salt|secret|password|^sign$|token|cvv|cvc|^pan$|securityCode|expiry|expiration|payment.*url|innerJsUrl|card|customer|payer|payee|shopper|address|email|phone|birth|identification|accountNumber|firstName|lastName|threeDS|authenticationValue|cavv|merchantUserId/i.test(key)) return '[已脱敏]';
  if (key === 'accId' || key === 'clientId') return typeof value === 'string' ? `${value.slice(0, 3)}••••` : '[已脱敏]';
  if (Array.isArray(value)) return value.map(x => redact(x, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, redact(v, secrets, k)]));
  if (typeof value === 'string') {
    if (key === 'error') return '[错误原文已隐藏；请参考HTTP状态、业务状态与验签结果]';
    if (/^(description|message|issuerResultMsg|resultDescription|remark)$/i.test(key)) return '[网关自由文本已隐藏；请参考状态码]';
    if (key === 'bizContent') { try { return redact(JSON.parse(value), secrets); } catch { return '[无法解析的业务原文已隐藏]'; } }
    let clean = value;
    for (const secret of secrets.filter(x => typeof x === 'string' && x.length > 2)) clean = clean.split(secret).join('[已脱敏]');
    if (!/^(?:merchantTransactionId|transactionId|requestId|merchantRefundId|refundId|merchantVoidId|.*Time|amount|unitPrice|number)$/.test(key)) clean = clean.replace(/\b(?:\d[ -]?){13,19}\b/g, '[长数字已脱敏]');
    clean = clean.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱已脱敏]');
    clean = clean.replace(/https?:\/\/[^\s"<>]+/gi, url => { try { const u = new URL(url); u.search = ''; u.hash = ''; u.username = ''; u.password = ''; return u.toString(); } catch { return '[URL已脱敏]'; } });
    return clean;
  }
  return value;
}
function validateRows(rows, currencies, fail) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 5000) fail('rows 必须包含 1 至 5000 行');
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(k => !['country','method','currency'].includes(k))) fail(`配置第 ${index+1} 行字段无效`);
    for (const key of ['country','method','currency']) if (typeof row[key] !== 'string' || row[key].length > 500 || /[\u0000-\u001f<>]/.test(row[key])) fail(`配置第 ${index+1} 行 ${key} 文本无效`);
    const country = row.country.trim(), method = row.method.trim(), currency = row.currency.trim();
    if (country && !/^[A-Z]{2}(?:\s*,\s*[A-Z]{2})*$/.test(country)) fail(`配置第 ${index+1} 行 country 必须是大写二字码列表`);
    if (currency && currency.split(',').some(x => !Object.hasOwn(currencies, x.trim()))) fail(`配置第 ${index+1} 行 currency 不支持`);
    return { country, method, currency };
  });
}
function makeActions({ state, fetchImpl, signBody, verifySign, fail, minor, updateOrder, log, endpoint, orderMerchant }) {
  const locks = new Set();
  const normalized = value => typeof value === 'string' ? value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : value;
  function assertIdentity(order, cred, mutation) {
    if (!cred?.accId || !cred.clientId || !cred.salt) fail('原订单环境的商户凭据不完整');
    if (order.merchantFingerprint && order.merchantFingerprint !== identity(order.env, cred)) fail('当前商户凭据与原订单绑定身份不一致，禁止操作', 409);
    if (!order.merchantFingerprint) fail('旧历史缺少商户身份绑定，无法安全确定原商户；请人工核实', 409);
  }
  async function call(order, action, biz, cred) {
    const target = new URL(ACTION_PATHS[action], endpoint(order.env)).href;
    const request = { accId:cred.accId, clientId:cred.clientId, signType:'SHA256', version:'1.0', bizContent:JSON.stringify(biz) };
    request.sign = await signBody(request, cred.salt);
    const requestTime = new Date().toISOString();
    const entry = { orderId:order.id, action, env:order.env, endpoint:target, method:'POST', request, requestTime, startedAt:requestTime, responseTime:null };
    try {
      const response = await fetchImpl(target, { method:'POST', headers:{ 'Content-Type':'application/json', Accept:'application/json' }, body:JSON.stringify(request), redirect:'error', signal:AbortSignal.timeout(20000) });
      entry.httpStatus = response.status || (response.ok ? 200 : 502);
      let data;
      if (typeof response.text === 'function') {
        entry.responseText = await response.text(); entry.responseTime = new Date().toISOString();
        data = JSON.parse(entry.responseText);
      } else { data = await response.json(); entry.responseTime = new Date().toISOString(); }
      entry.response = data; entry.signatureVerified = await verifySign(data, cred.salt);
      if (!response.ok) fail('订单接口 HTTP 响应失败', 502);
      if (!entry.signatureVerified) fail('响应签名缺失或验签失败', 502);
      if (typeof data.bizContent !== 'string') fail('响应 bizContent 必须是签名原始字符串', 502);
      const result = JSON.parse(data.bizContent);
      if (!result || typeof result !== 'object' || Array.isArray(result)) fail('响应业务格式无效', 502);
      for (const source of [data,result]) for (const key of ['accId','clientId']) if (source[key] !== undefined && source[key] !== cred[key]) fail('响应商户身份不匹配', 502);
      if (!(action === 'refundQuery' ? ['001000'] : ['000000','001000','002000']).includes(data.code)) fail(`订单接口拒绝请求（${String(data.code).slice(0,32)}），请查看本页日志`, 502);
      if (result.merchantTransactionId !== order.merchantTransactionId || typeof result.transactionId !== 'string' || !result.transactionId || (order.transactionId && result.transactionId !== order.transactionId)) fail('响应订单号或交易号不匹配', 502);
      const expectedAmount = action === 'query' ? order.amount : action === 'refundQuery' ? order.refundAmount : biz.amount;
      if (action !== 'cancel' && (result.currency !== order.currency || minor(normalized(result.amount), order.currency, '响应金额') !== minor(normalized(expectedAmount), order.currency, '请求金额'))) fail('响应金额或币种与原请求不一致', 502);
      if (action === 'refund' || action === 'refundQuery') {
        if (result.merchantRefundId !== undefined && result.merchantRefundId !== biz.merchantRefundId) fail('商户退款流水号不匹配', 502);
        if (result.refundId !== undefined && (typeof result.refundId !== 'string' || !result.refundId.trim() || (order.refundId && result.refundId !== order.refundId))) fail('平台退款流水号不匹配', 502);
      }
      const status = action === 'cancel' ? result.resultStatus : result.status;
      const allowed = action === 'query' ? PAYMENT_STATUSES : action === 'cancel' ? ['SUCCESS','FAILED','UNKNOWN'] : ['SUCCESS','FAILED','PROCESSING'];
      if (!allowed.includes(status)) fail('接口未返回受支持的官方业务状态，不能当作成功', 502);
      entry.businessStatus = status;
      return { data, result, status };
    } catch (e) { entry.error = e.status ? e.message : '网络异常或响应无法解析，结果未知，禁止直接重试变更'; if (e.status) throw e; fail(entry.error, 502); }
    finally { entry.completedAt = new Date().toISOString(); log(entry); }
  }
  async function query(order, cred) {
    if (!order.currency) fail('旧订单未指定币种，无法安全核对查询结果；请在商户后台人工核查', 409);
    const result = await call(order, 'query', { merchantTransactionId:order.merchantTransactionId, ...(order.transactionId ? { transactionId:order.transactionId } : {}) }, cred);
    const current = state.orders.find(o => o.id === order.id);
    const oldStatus = { PAID:'SUCCESS', CANCELLED:'CANCEL', AUTHORIZED:'AUTH_SUCCESS', PAYMENT_FAILED:'FAILED' }[current.status] || current.status;
    if ((['SUCCESS','CANCEL','CLOSED'].includes(oldStatus) && oldStatus !== result.status) || (oldStatus === 'AUTH_SUCCESS' && !['AUTH_SUCCESS','SUCCESS','CANCEL'].includes(result.status))) fail('查询结果试图回退或覆盖已确认状态，请人工核查', 409);
    updateOrder(order.id, { status:result.status, transactionId:result.result.transactionId, queriedAt:new Date().toISOString(), responseSummary:{ code:result.data.code, signatureVerified:true } });
    return result;
  }
  async function refundContext(order, cred) {
    const context = { merchantRefundId:order.merchantRefundId, refundId:order.refundId, refundAmount:order.refundAmount };
    if (!context.merchantRefundId && order.lastAction === 'refund') context.merchantRefundId = order.lastActionId;
    for (const entry of state.logs) {
      if (entry.orderId !== order.id || entry.action !== 'refund' || entry.env !== order.env || entry.signatureVerified !== true || !Number.isInteger(entry.httpStatus) || entry.httpStatus < 200 || entry.httpStatus >= 300) continue;
      try {
        if (!await verifySign(entry.request, cred.salt) || !await verifySign(entry.response, cred.salt) || typeof entry.request.bizContent !== 'string' || typeof entry.response.bizContent !== 'string') continue;
        const request = JSON.parse(entry.request.bizContent), response = JSON.parse(entry.response.bizContent);
        if ([entry.request,entry.response,request,response].some(source => !source || typeof source !== 'object' || Array.isArray(source) || ['accId','clientId'].some(key => source[key] !== undefined && source[key] !== cred[key]))) continue;
        if (entry.request.accId !== cred.accId || entry.request.clientId !== cred.clientId || !['000000','001000','002000'].includes(entry.response.code)) continue;
        if (request.merchantTransactionId !== order.merchantTransactionId || response.merchantTransactionId !== order.merchantTransactionId || !order.transactionId || response.transactionId !== order.transactionId || request.currency !== order.currency || response.currency !== order.currency) continue;
        if (typeof request.merchantRefundId !== 'string' || !request.merchantRefundId.trim() || (response.merchantRefundId !== undefined && response.merchantRefundId !== request.merchantRefundId) || (response.refundId !== undefined && (typeof response.refundId !== 'string' || !response.refundId.trim()))) continue;
        if (!['SUCCESS','FAILED','PROCESSING'].includes(response.status) || minor(normalized(request.amount), order.currency, '退款申请金额') !== minor(normalized(response.amount), order.currency, '退款响应金额')) continue;
        const candidate = { merchantRefundId:request.merchantRefundId, refundId:response.refundId, refundAmount:request.amount };
        for (const key of Object.keys(candidate)) {
          if (candidate[key] === undefined) continue;
          const matches = key === 'refundAmount' ? normalized(context[key]) === normalized(candidate[key]) : context[key] === candidate[key];
          if (context[key] !== undefined && !matches) fail('历史退款记录存在冲突，请人工核查', 409);
          context[key] = candidate[key];
        }
      } catch (error) { if (error.status === 409) throw error; }
    }
    if (![context.merchantRefundId,context.refundId].some(value => typeof value === 'string' && value.trim()) || !order.transactionId || !order.currency || !context.refundAmount) fail('缺少可核实的退款流水号或申请金额，请在商户后台人工核查；禁止重试退款', 409);
    const units = minor(normalized(context.refundAmount), order.currency, '退款申请金额');
    if (units <= 0n || units > minor(normalized(order.amount), order.currency, '订单金额')) fail('退款申请金额无效，请人工核查', 409);
    for (const key of ['merchantRefundId','refundId']) if (context[key] !== undefined && (typeof context[key] !== 'string' || !context[key].trim())) fail('退款流水号无效，请人工核查', 409);
    updateOrder(order.id, { ...context, refundAttempted:true, refundStatus:order.refundStatus || 'UNKNOWN', refundedAmount:order.refundStatus === 'SUCCESS' ? context.refundAmount : '0' });
    return state.orders.find(item => item.id === order.id);
  }
  async function refundQuery(order, cred) {
    order = await refundContext(order, cred);
    const biz = { merchantTransactionId:order.merchantTransactionId, ...(order.merchantRefundId ? {merchantRefundId:order.merchantRefundId} : {}), ...(order.refundId ? {refundId:order.refundId} : {}) };
    const result = await call(order, 'refundQuery', biz, cred);
    if (['SUCCESS','FAILED'].includes(order.refundStatus) && order.refundStatus !== result.status) fail('退款查询试图回退或覆盖已确认终态，请人工核查', 409);
    updateOrder(order.id, { refundStatus:result.status, refundedAmount:result.status === 'SUCCESS' ? order.refundAmount : '0', ...(result.result.refundId ? {refundId:result.result.refundId} : {}), refundQueriedAt:new Date().toISOString(), ...(order.lastAction === 'refund' ? {lastActionStatus:result.status} : {}), ...(order.pendingAction === 'refund' && ['SUCCESS','FAILED'].includes(result.status) ? {pendingAction:''} : {}) });
    return { action:'refundQuery', status:result.status, code:result.data.code, bizContent:redact(result.result, [cred.salt,cred.accId,cred.clientId]), order:state.orders.find(item => item.id === order.id) };
  }
  const handleAction = async function(input) {
    if (typeof input.id !== 'string' || !Object.hasOwn(ACTION_PATHS, input.action)) fail('订单操作参数无效');
    let order = state.orders.find(o => o.id === input.id); if (!order) fail('订单不存在', 404);
    if (order.simulated) fail('模拟订单不能调用真实订单操作');
    if (locks.has(order.id)) fail('订单已有操作进行中，请勿重复提交', 409);
    const mutation = !['query','refundQuery'].includes(input.action), cred = { ...orderMerchant(order).credentials };
    assertIdentity(order, cred, mutation);
    if (mutation && input.confirmed !== true) fail('变更操作必须明确 confirmed=true');
    if (mutation && order.env === 'production' && input.productionConfirmed !== true) fail('生产资金变更需要 productionConfirmed=true 二次确认');
    locks.add(order.id);
    try {
      if (input.action === 'refundQuery') return await refundQuery(order, cred);
      if (mutation && order.pendingAction) fail('此订单存在待确认的变更结果，禁止重复操作；请在商户后台核查', 409);
      if (input.action === 'refund' && (order.refundAttempted || order.merchantRefundId || order.refundId || order.refundStatus || order.lastAction === 'refund' || state.logs.some(entry => entry.orderId === order.id && entry.action === 'refund'))) fail('工作台 每单仅允许一次退款尝试，防止重复退款；后续部分退款请在商户后台核查处理', 409);
      const latest = await query(order, cred);
      if (!mutation) return { action:'query', status:latest.status, order:state.orders.find(o => o.id === order.id), bizContent:redact(latest.result, [cred.salt, cred.accId, cred.clientId]), warning:order.merchantFingerprint ? undefined : '旧订单缺少商户绑定；本次查询不建立资金操作授权' };
      order = state.orders.find(o => o.id === order.id);
      const currentCred = orderMerchant(order).credentials;
      assertIdentity(order, currentCred, true);
      if (['accId','clientId','salt'].some(key => currentCred[key] !== cred[key])) fail('商户凭据已变化，请重新查询后操作',409);
      const allowed = { refund:['SUCCESS'], cancel:['INIT','PROCESSING','FAILED'] }[input.action];
      if (!allowed.includes(latest.status)) fail(`当前官方状态 ${latest.status} 不允许 ${input.action}`, 409);
      const biz = { merchantTransactionId:order.merchantTransactionId };
      let actionId;
      if (input.action !== 'cancel') {
        const amount = input.amount === undefined || input.amount === '' ? order.amount : input.amount;
        const units = minor(amount, order.currency, '操作金额');
        if (units <= 0n || units > minor(order.amount, order.currency, '订单金额')) fail('操作金额必须大于零且不能超过原订单金额');
        actionId = crypto.randomUUID(); Object.assign(biz, { currency:order.currency, amount });
        biz.merchantRefundId = actionId;
      }
      updateOrder(order.id, { pendingAction:input.action, lastAction:input.action, lastActionId:actionId, lastActionStatus:'UNKNOWN', ...(input.action === 'refund' ? { refundAttempted:true, merchantRefundId:actionId, refundAmount:biz.amount, refundStatus:'UNKNOWN', refundedAmount:'0' } : {}) });
      const result = await call(order, input.action, biz, cred);
      const patch = { lastActionStatus:result.status, pendingAction:['PROCESSING','UNKNOWN'].includes(result.status) ? input.action : '' };
      if (input.action === 'refund') Object.assign(patch, { refundStatus:result.status, refundedAmount:result.status === 'SUCCESS' ? biz.amount : '0', ...(result.result.refundId ? {refundId:result.result.refundId} : {}) });
      if (input.action === 'cancel') { patch.cancelStatus = result.status; if (result.status === 'SUCCESS') patch.status = 'CLOSED'; }
      updateOrder(order.id, patch);
      return { action:input.action, status:result.status, code:result.data.code, bizContent:redact(result.result, [cred.salt, cred.accId, cred.clientId]), order:state.orders.find(o => o.id === order.id) };
    } finally { locks.delete(order.id); }
  };
  handleAction.isBusy = id => locks.has(id);
  return handleAction;
}
export { identity, redact, validateRows, makeActions, PAYMENT_STATUSES };
