import {sign as signBody, verifySign} from './gateway.js?v=2.2.1';
import {makeActions, validateRows, identity} from './order-actions.js?v=2.2.1';
import {createMerchants} from './merchants.js?v=2.2.1';
import * as profiles from './profile-config.js?v=2.2.1';
import {newWorkbook, decode, checkArchive as checkZip, ipVersion} from './workbook.js?v=2.2.1';
const {currencies:CURRENCIES,rows:DEFAULT_ROWS,compileRows,validateSelection} = globalThis.CheckoutOptions;
const ENVS = ['production','sandbox'];
const MAX_UPLOAD = 1024 * 1024;
const fetchImpl = (url,options) => fetch(url,{...options,credentials:'omit',mode:'cors',cache:'no-store',referrerPolicy:'no-referrer'});
const TEST_ADDRESS_REGIONS = {
  MY: { state:'Kuala Lumpur', city:'Kuala Lumpur', postcode:'50000' },
  ID: { state:'DKI Jakarta', city:'Jakarta', postcode:'10110' },
  JP: { state:'Tokyo', city:'Shinjuku', postcode:'160-0022' },
  VN: { state:'Ho Chi Minh', city:'Ho Chi Minh', postcode:'70000' },
  TH: { state:'Bangkok', city:'Bangkok', postcode:'10110' },
  PH: { state:'Metro Manila', city:'Manila', postcode:'1000' },
  HK: { state:'Hong Kong, China', city:'Hong Kong, China', postcode:'000000' },
  CN: { state:'Guangdong', city:'Shenzhen', postcode:'518000' },
  KR: { state:'Seoul', city:'Gangnam-gu', postcode:'06236' },
  SG: { state:'Singapore', city:'Singapore', postcode:'018956' }
};
function publicIPv4(ip) {
  if (typeof ip !== 'string' || ipVersion(ip) !== 4) return false;
  const [a, b, c] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
function testAddress(country) {
  if (!Object.hasOwn(TEST_ADDRESS_REGIONS, country)) fail('不支持该国家或地区的测试地址');
  const number = 1 + crypto.getRandomValues(new Uint32Array(1))[0] % 9999;
  return { address:{ country, ...TEST_ADDRESS_REGIONS[country], street:country === 'CN' || country === 'HK' ? `沙箱测试路 ${number} 号（虚构）` : `${number} Sandbox Test Street (Synthetic)` }, synthetic:true, notice:'仅沙箱测试，非真实可投递地址' };
}
const ORDER_FIELDS = ['amount','currency','merchantTransactionId','productName','unitPrice','number','customerEmail','language','shopperIP','merchantUserId','captureDelayHours','payResultUrl','payCancelUrl','notificationUrl','tradeCountry','paymentMethods','shippingCountry','shippingState','shippingCity','shippingStreet','shippingPostcode','billingCountry','billingState','billingCity','billingStreet','billingPostcode'];
const TEXT_FIELDS = ['accId','clientId','salt','merchantTransactionId','merchantUserId','shippingPostcode','billingPostcode'];
const HISTORY_FIELDS = ['id','merchantTransactionId','env','amount','currency','mode','status','createdAt','updatedAt','transactionId','simulated','productionTestMode','syntheticProfile','syntheticAddress','notificationRequestId','notificationStatus','tradeCountry','merchantId','merchantFingerprint','notificationUrl','queriedAt','pendingAction','lastAction','lastActionId','lastActionStatus','refundAttempted','merchantRefundId','refundId','refundAmount','refundStatus','refundedAmount','refundQueriedAt','cancelStatus'];
function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function environment(env) { if (!ENVS.includes(env)) fail('环境必须为 production 或 sandbox'); return env; }
function endpoint(env) { environment(env); return env === 'sandbox' ? 'https://sandbox-acquirer-payment.pingpongx.com/v4/payment/prePay' : 'https://acquirer-payment.pingpongx.com/v4/payment/prePay'; }
function mask(value) { return !value ? '' : value.length <= 8 ? '••••' : `${value.slice(0, 4)}••••${value.slice(-4)}`; }
function safeOrder(order) {
  const out = Object.fromEntries(HISTORY_FIELDS.filter(k => ['string','number','boolean'].includes(typeof order[k])).map(k => [k, order[k]]));
  for (const name of ['requestSummary', 'responseSummary']) if (object(order[name])) out[name] = Object.fromEntries(['merchantTransactionId','amount','currency','captureDelayHours','tradeCountry','code','signatureVerified'].filter(k => ['string','number','boolean'].includes(typeof order[name][k])).map(k => [k,order[name][k]]));
  if (Array.isArray(order.paymentMethods)) out.paymentMethods = order.paymentMethods.filter(x => typeof x === 'string');
  if (out.requestSummary && out.paymentMethods) out.requestSummary.paymentMethods = [...out.paymentMethods];
  return out;
}
function minor(value, currency, field) {
  const digits = currency === undefined ? 6 : CURRENCIES[currency];
  if (typeof value !== 'string' || value.length > 24 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(value) || (value.split('.')[1] || '').length > digits) fail(`${field} 必须是有效的固定小数金额字符串（${currency === undefined ? '未指定币种' : currency} 最多 ${digits} 位小数）`);
  return BigInt(value.split('.')[0]) * 10n ** BigInt(digits) + BigInt((value.split('.')[1] || '').padEnd(digits, '0') || '0');
}
function checkUrl(value, field, env) {
  if (typeof value !== 'string') fail(`${field} URL 无效`);
  let u; try { u = new URL(value); } catch { fail(`${field} URL 无效`); }
  if (field === 'notificationUrl' && (u.search || u.hash || u.pathname === '/')) fail('notificationUrl 必须提供具体路径且不能包含 query 或 hash');
  const loopback = ['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  if (u.username || u.password || (u.protocol !== 'https:' && !(env === 'sandbox' && field !== 'notificationUrl' && loopback && u.protocol === 'http:')) || (field === 'notificationUrl' && loopback)) fail(`${field} 必须使用 HTTPS 公网地址；仅沙箱回跳允许 localhost HTTP`);
}
function validateBiz(input, env, { real = true, rows = DEFAULT_ROWS } = {}) {
  environment(env); if (!object(input)) fail('bizContent 必须是对象');
  const b = JSON.parse(JSON.stringify(input));
  delete b.syntheticProfile; delete b.syntheticAddress; delete b.productionTestMode; delete b.productionConfirmed;
  for (const key of ['currency','tradeCountry','paymentMethods']) if (b[key] == null || (typeof b[key] === 'string' && !b[key].trim())) delete b[key];
  if (b.currency !== undefined && (typeof b.currency !== 'string' || !Object.hasOwn(CURRENCIES, b.currency))) fail('currency 不在支持的金额精度币种集合中');
  if (b.paymentMethods !== undefined) {
    if (!Array.isArray(b.paymentMethods) || b.paymentMethods.some(method => typeof method !== 'string')) fail('paymentMethods 必须是字符串数组');
    b.paymentMethods = [...new Set(b.paymentMethods)];
    if (!b.paymentMethods.length) delete b.paymentMethods;
  }
  const selectionError = validateSelection(b, rows); if (selectionError) fail(selectionError);
  if (typeof b.merchantTransactionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(b.merchantTransactionId)) fail('merchantTransactionId 必须为有效文本 ID');
  if (b.merchantUserId !== undefined && typeof b.merchantUserId !== 'string') fail('merchantUserId 必须为文本');
  const amount = minor(b.amount, b.currency, 'amount'); if (amount <= 0n) fail('订单金额必须大于 0');
  if (!Array.isArray(b.goods) || !b.goods.length || b.goods.length > 100) fail('需要 1 至 100 个商品项');
  let total = 0n;
  for (const g of b.goods) {
    if (!object(g) || typeof g.name !== 'string' || !g.name.trim()) fail('商品名称不能为空');
    if (real) {
      if (typeof g.imgUrl !== 'string' || !g.imgUrl.trim() || g.imgUrl.length > 255) fail('goods.imgUrl 必须提供不超过 255 字符的商品主图链接');
      let image; try { image = new URL(g.imgUrl); } catch { fail('goods.imgUrl 必须为有效的 HTTP(S) URL'); }
      if (!['http:', 'https:'].includes(image.protocol) || image.username || image.password) fail('goods.imgUrl 必须为无凭据的 HTTP(S) URL');
    }
    if (!['Y','N'].includes(g.virtualProduct)) fail('virtualProduct 必须为 Y 或 N');
    if (typeof g.number !== 'string' || !/^[1-9]\d{0,8}$/.test(g.number)) fail('商品数量必须为正整数字符串');
    const price = minor(g.unitPrice, b.currency, 'unitPrice'); if (price <= 0n) fail('商品单价必须大于 0'); total += price * BigInt(g.number);
  }
  if (total !== amount) fail('商品金额合计与订单金额不一致');
  if (real && (b.captureDelayHours == null || b.captureDelayHours === '')) fail('真实调用必须明确选择 captureDelayHours，不能留空');
  b.captureDelayHours = b.captureDelayHours === undefined || b.captureDelayHours === '' ? 0 : b.captureDelayHours;
  if (!Number.isInteger(b.captureDelayHours) || b.captureDelayHours < -1 || b.captureDelayHours > 168) fail('captureDelayHours 必须是 -1 至 168 的整数');
  for (const k of ['payResultUrl','payCancelUrl']) checkUrl(b[k], k, env);
  if (b.notificationUrl) checkUrl(b.notificationUrl, 'notificationUrl', env); else delete b.notificationUrl;
  if (typeof b.shopperIP !== 'string' || !ipVersion(b.shopperIP)) fail('shopperIP 必须是有效 IP 地址');
  if (real && (b.shopperIP === '::1' || b.shopperIP === '::' || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(b.shopperIP) || /^(fc|fd|fe80|::ffff:)/i.test(b.shopperIP))) fail('真实调用请填写买家的真实公网 shopperIP，不能使用回环或内网 IP');
  const physical = b.goods.some(g => g.virtualProduct === 'N');
  const emailValid = object(b.customer) && typeof b.customer.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.customer.email);
  if (physical && !emailValid) fail('实物订单必须提供 customer.email');
  if (!physical && !emailValid && !(typeof b.merchantUserId === 'string' && b.merchantUserId.trim())) fail('虚拟订单必须提供有效 customer.email 或 merchantUserId');
  for (const name of physical ? ['shippingAddress','billingAddress'] : ['billingAddress']) {
    if (!object(b[name])) fail(`订单必须提供 ${name}（其他虚拟类仍需账单地址）`);
    for (const field of ['country','state','city','street','postcode']) if (typeof b[name][field] !== 'string' || !b[name][field].trim()) fail(`订单必须提供 ${name}.${field}`);
  }
  return b;
}
async function makeTemplate() {
  const wb = await newWorkbook();
  const config = wb.addWorksheet('环境配置');
  config.columns = ['environment','importMode','clientId','accId','salt','Remark'].map(key => ({header:key,key,width:24,style:{numFmt:'@'}}));
  config.addRows(ENVS.map(environment => ({environment,importMode:'merge'})));
  const orders = wb.addWorksheet('订单请求'); orders.columns = ORDER_FIELDS.map(key => ({ header: key, key, width: 24, style: { numFmt: '@' } }));
  // 空白订单模板避免示例数据被误当成真实支付请求。
  orders.addRow(Object.fromEntries(ORDER_FIELDS.map(k => [k, ''])));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
const merchantHeaders = new Map(Object.entries({
  environment:'environment', env:'environment', '环境':'environment', '环境配置':'environment',
  importmode:'importMode', accid:'accId', clientid:'clientId', salt:'salt',
  remark:'Remark', '备注':'Remark', '商户备注':'Remark'
}));
const merchantEnvironments = new Map(Object.entries({
  production:'production', prod:'production','生产':'production','生产环境':'production',
  sandbox:'sandbox', test:'sandbox','测试':'sandbox','沙箱':'sandbox','沙箱环境':'sandbox','测试环境':'sandbox'
}));
function rowsFromSheet(ws, allowed, aliases) {
  if (!ws) return []; if (ws.rowCount > 1000 || ws.columnCount > 40) fail('工作表过大'); const headers = new Map();
  ws.getRow(1).eachCell((cell, n) => {
    const raw = typeof cell.value === 'string' ? cell.value.trim() : '';
    const key = aliases ? aliases.get(raw.toLowerCase()) : raw;
    if (!allowed.includes(key) || headers.has(key)) fail(`${ws.name}第 ${n} 列表头无效或重复，请核对模板`);
    headers.set(key,n);
  });
  const result = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const out = {}; const row = ws.getRow(r);
    row.eachCell((c, n) => { if (c.value !== null && ![...headers.values()].includes(n)) fail('发现未知列数据'); });
    for (const [key, n] of headers) { const value = row.getCell(n).value; if (value == null || value === '') { out[key] = ''; continue; } if (!['string','number'].includes(typeof value)) fail('不接受公式、超链接或富文本单元格'); if (TEXT_FIELDS.includes(key) && typeof value !== 'string') fail(`${key} 必须是文本单元格，不能用数字以免精度丢失`); out[key] = String(value).trim(); }
    if (Object.values(out).some(Boolean)) { Object.defineProperty(out,'_excelRow',{value:r,enumerable:false}); result.push(out); }
  }
  return result;
}
function orderFromRow(o) {
  const b = { amount: o.amount, currency: o.currency, merchantTransactionId: o.merchantTransactionId, payResultUrl: o.payResultUrl, payCancelUrl: o.payCancelUrl, notificationUrl: o.notificationUrl, shopperIP: o.shopperIP, captureDelayHours: o.captureDelayHours ? Number(o.captureDelayHours) : 0, customer: { email: o.customerEmail }, goods: [{ name: o.productName, unitPrice: o.unitPrice, number: o.number, virtualProduct: 'N' }] };
  if (o.tradeCountry) b.tradeCountry = o.tradeCountry;
  if (o.paymentMethods) b.paymentMethods = o.paymentMethods.split(',').map(method => method.trim());
  if (o.merchantUserId) b.merchantUserId = o.merchantUserId;
  for (const section of ['shipping','billing']) b[`${section}Address`] = Object.fromEntries(['country','state','city','street','postcode'].map(k => [k, o[section + k[0].toUpperCase() + k.slice(1)]]));
  return b;
}
let publicIPCache, publicIPPending;
async function getPublicIP(refresh = false) {
  if (!refresh && publicIPCache && publicIPCache.expiresAt > Date.now()) return publicIPCache.result;
  if (!publicIPPending) publicIPPending = (async () => {
    publicIPCache = undefined;
    const controller = new AbortController();
    let timer;
    const sources = [
      { url:'https://api.ipify.org?format=json', source:'api.ipify.org', json:true },
      { url:'https://api4.ipify.org?format=json', source:'api4.ipify.org', json:true },
      { url:'https://ipv4.icanhazip.com', source:'ipv4.icanhazip.com', json:false }
    ];
    try {
      const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('公网 IP 查询超时')); }, 2500); });
      const queries = sources.map(async source => {
        const response = await fetchImpl(source.url, { method:'GET', headers:{ Accept:source.json ? 'application/json' : 'text/plain' }, redirect:'error', signal:controller.signal });
        if (!response.ok || response.redirected) throw new Error('公网 IP 服务失败');
        const ip = source.json ? (await response.json())?.ip : (await response.text()).trim();
        if (!publicIPv4(ip)) throw new Error('公网 IPv4 无效');
        return { ip, fallback:false, source:source.source };
      });
      const result = await Promise.race([Promise.any(queries), deadline]);
      publicIPCache = { result, expiresAt:Date.now() + 60000 };
      return result;
    } catch {
      return { ip:'', fallback:true, source:'unavailable', notice:'获取失败，请手工填写当前公网 IP' };
    } finally { clearTimeout(timer); controller.abort(); }
  })();
  try { return await publicIPPending; } finally { publicIPPending = undefined; }
}

const namespace = 'checkout-offline-demo.web.';
function readSetting(key) {
  try { return JSON.parse(sessionStorage.getItem(namespace + key)); } catch { return null; }
}
function storeSetting(key, value) {
  sessionStorage.setItem(namespace + key, JSON.stringify(value));
}
const migrated = (readSetting('receipts.v1') || []).filter(r => r && typeof r.id === 'string' && typeof r.merchant === 'string').map(r => ({
  id:crypto.randomUUID(),merchantTransactionId:r.id,merchantFingerprint:r.merchant.toLowerCase(),env:r.env,
  amount:r.amount,currency:r.currency,status:r.status,transactionId:r.transactionId,mode:'redirect'
}));
const orders = (readSetting('orders.v2') || migrated).map(safeOrder);
for (const order of orders) if (order.status === 'REQUESTING') order.status = 'UNKNOWN';
const paymentSaved = readSetting('payment.v2');
const lastEnv = readSetting('environment');
const state = {env:ENVS.includes(lastEnv) ? lastEnv : 'production', orders, logs:[], paymentRows:paymentSaved?.rows || DEFAULT_ROWS, paymentVersion:paymentSaved?.version || 'default-v1'};
function useEnvironment(env) {
  state.env = environment(env);
  try { storeSetting('environment',env); } catch { /* The current page can still use its in-memory environment. */ }
}
const merchants = createMerchants(state,fail);
const activePrepays = new Set();
const profileHelpers = {fail,minor,checkUrl,checkZip};
const profileSaved = readSetting('profiles.v2');
state.profileData = profileSaved?.data || profiles.defaults(state.paymentRows);
state.profileVersion = profileSaved?.version || 'default-v1';
const log = entry => { state.logs.push({...entry,id:crypto.randomUUID(),timestamp:new Date().toISOString()}); };
const publicProfiles = () => ({ schemaVersion:1, version:state.profileVersion, data:JSON.parse(JSON.stringify(state.profileData)) });
function saveProfiles(input) {
  if (Object.keys(input).some(k => !['data','expectedVersion'].includes(k))) fail('资料配置仅接受 data、expectedVersion');
  if (input.expectedVersion !== undefined && input.expectedVersion !== state.profileVersion) fail('资料版本已变化，请重新加载后保存',409);
  const data = profiles.validateProfiles(input.data,state.paymentRows,profileHelpers), version = crypto.randomUUID();
  storeSetting('profiles.v2',{schemaVersion:1,version,data}); state.profileData = data; state.profileVersion = version;
  return publicProfiles();
}
async function previewProfiles(base64) {
  const data = await profiles.parseWorkbook(base64,state.paymentRows,profileHelpers);
  return { schemaVersion:1,version:state.profileVersion,data,summary:profiles.summary(data) };
}
function savePaymentConfig(input) {
  if (Object.keys(input).some(k => !['rows'].includes(k))) fail('支付配置只接受 rows 字段');
  const rows = validateRows(input.rows, CURRENCIES, fail), version = crypto.randomUUID();
  if (state.profileVersion !== 'default-v1') profiles.validateProfiles(state.profileData,rows,profileHelpers);
  storeSetting('payment.v2', { schemaVersion:1, version, rows }); state.paymentRows = rows; state.paymentVersion = version;
  if (state.profileVersion === 'default-v1') state.profileData = profiles.defaults(rows);
  return { rows, version };
}
const publicCredential = cred => ({accId:mask(cred.accId),clientId:mask(cred.clientId),configured:Boolean(cred.accId && cred.clientId && cred.salt)});
const publicConfig = () => ({ sessionMerchants:true, env:state.env, environments:ENVS, credentials:Object.fromEntries(ENVS.map(env => [env,{...publicCredential(merchants.active(env)),endpoint:endpoint(env)}])), merchants:Object.fromEntries(ENVS.map(env => [env,state.merchants[env].map(row => ({id:row.id,remark:row.credentials.remark || '',...publicCredential(row.credentials)}))])), selectedMerchantIds:{...state.selectedMerchantIds} });
function selectMerchant(input) { merchants.select(input); return publicConfig(); }

function saveOrders(next) {
  const clean = next.slice(0,1000).map(safeOrder);
  const summaries = clean.map(({notificationUrl,...row}) => row);
  storeSetting('orders.v2', summaries);
  state.orders = clean;
}
function updateOrder(id, patch) { saveOrders(state.orders.map(o => o.id === id ? { ...o, ...patch, updatedAt: new Date().toISOString() } : o)); }
const handleAction = makeActions({ state, fetchImpl, signBody, verifySign, fail, minor, updateOrder, log, endpoint, checkUrl, orderMerchant:merchants.forOrder });
function deleteOrder(input) {
  if (Object.keys(input).some(k => !['id','confirmed'].includes(k)) || typeof input.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(input.id) || input.confirmed !== true) fail('删除本地记录必须提供 id 且 confirmed=true');
  const order = state.orders.find(o => o.id === input.id); if (!order) fail('订单不存在',404);
  if (order.status === 'REQUESTING' || order.pendingAction || activePrepays.has(order.id) || handleAction.isBusy(order.id)) fail('订单仍在请求中或存在待确认操作，不能删除本地记录',409);
  saveOrders(state.orders.filter(order => order.id !== input.id));
  state.logs = state.logs.filter(entry => entry.orderId !== input.id);
  return {deleted:true,id:input.id};
}
async function importWorkbook(input, strategy = 'file') {
  if (!['file','merge'].includes(strategy)) fail('导入方式无效');
  const files = Array.isArray(input) ? input : [input];
  if (!files.length || (strategy === 'file' && files.length !== 1)) fail('按文件规则恢复时请选择一个工作簿');
  const configRows = [], orderRows = [];
  let totalBytes = 0;
  for (const [index, base64] of files.entries()) {
    try {
      if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_UPLOAD / 3) * 4 || base64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) fail('base64 无效或超过 1MB');
      const buffer = decode(base64);
      totalBytes += buffer.length;
      if (totalBytes > 8 * MAX_UPLOAD) fail('所选 Excel 文件合计超过 8 MB，请分批导入');
      checkZip(buffer);
      const wb = await newWorkbook();
      try { await wb.xlsx.load(buffer); } catch { fail('xlsx 工作簿无法读取'); }
      const orders = wb.getWorksheet('订单请求');
      let sheet = wb.getWorksheet('环境配置');
      if (!sheet && !orders && wb.worksheets.length === 1) {
        const candidate = wb.worksheets[0];
        const keys = candidate.getRow(1).values.map(raw => merchantHeaders.get(String(raw).trim().toLowerCase()));
        if (['environment','accId','clientId','salt'].every(key => keys.includes(key))) sheet = candidate;
      }
      if (!sheet && !orders) fail('缺少“环境配置”或“订单请求”工作表');
      const rows = rowsFromSheet(sheet, ['environment','importMode','clientId','accId','salt','Remark'], merchantHeaders);
      for (const row of rows) {
        row.environment = merchantEnvironments.get(row.environment?.toLowerCase());
        if (!row.environment) fail(`环境配置第 ${row._excelRow} 行须指定 production（生产）或 sandbox（沙箱）`);
      }
      if (files.length > 1) for (const row of rows) Object.defineProperty(row,'_fileNumber',{value:index + 1});
      configRows.push(...rows);
      orderRows.push(...rowsFromSheet(orders, ORDER_FIELDS));
      if (orderRows.length > 1) fail('每次导入仅支持一个订单请求行');
    } catch (error) {
      if (files.length > 1) fail(`第 ${index + 1} 个文件：${error.message}`,error.status);
      throw error;
    }
  }
  const next = await merchants.importRows(configRows,strategy);
  const order = orderRows[0] || null;
  if (!order && !next.importedEnvironments.length) fail('未找到商户或订单。请在「环境配置」填写 environment、accId、clientId 和 salt 后再导入。');
  const targetEnv = !next.merchants[state.env].length && next.importedEnvironments.length === 1 && next.merchants[next.importedEnvironments[0]].length
    ? next.importedEnvironments[0] : state.env;
  if (order) validateBiz(orderFromRow(order), targetEnv, { real: false, rows:state.paymentRows });
  if (next.importedEnvironments.length) merchants.commit(next.merchants,next.selected);
  useEnvironment(targetEnv);
  return { ...publicConfig(), order, importedEnvironments:next.importedEnvironments, importSummary:next.importSummary };
}
function testDataFlags(input) {
  return { productionTestMode:input.env === 'production' && input.productionTestMode === true,
    syntheticProfile:input.syntheticProfile === true || input.bizContent?.syntheticProfile === true,
    syntheticAddress:input.syntheticAddress === true || input.bizContent?.syntheticAddress === true };
}
function validateProductionData(input) {
  const flags = testDataFlags(input);
  if (input.env === 'production') {
    if (flags.productionTestMode || flags.syntheticProfile) fail('合成测试资料仅限沙箱，请填写生产资料');
    const biz = input.bizContent;
    if (biz && (biz.goods?.some(g => /沙箱测试商品[12]$/.test(g.name)) ||
        /^sandbox-[a-z]{2}-[12]@example\.com$/i.test(biz.customer?.email || '') ||
        [biz.billingAddress,biz.shippingAddress].some(a => /Sandbox (?:Test|Billing) Street \(Synthetic\)|沙箱测试路.*（虚构）/.test(a?.street || '')) ||
        biz.merchantUserId === 'sandbox-synthetic-user')) fail('请将内置沙箱资料替换为生产资料');
    if (flags.syntheticAddress) fail('合成测试地址仅限沙箱，请填写生产地址');
    if (input.productionConfirmed !== true) fail('生产环境必须明确确认 productionConfirmed=true');
  }
  return flags;
}
const elementSessions = new Map();
const elementMethods = { applePayButton:'ApplePay', googlePayButton:'GooglePay', paypalButton:'PayPal' };
function duplicateOrder(env, merchant, merchantTransactionId) {
  return state.orders.some(order => !order.simulated && order.env === env && order.merchantTransactionId === merchantTransactionId && (!order.merchantFingerprint || order.merchantFingerprint === identity(env,merchant.credentials)));
}
async function handleSdkSession(input, mode) {
  const label = mode === 'onepage' ? 'OnePage' : 'Elements';
  const env = environment(input.env);
  if (input.mode !== mode || (mode === 'elements' && !Object.hasOwn(elementMethods, input.elementType))) fail(`${label} 模式或支付元素类型无效`);
  const testFlags = validateProductionData(input);
  const b = validateBiz(input.bizContent, env, { rows:state.paymentRows });
  if (!b.tradeCountry || !b.currency) fail(`${label} 必须明确选择国家及币种`);
  let allowedMethods;
  if (mode === 'elements') {
    const method = elementMethods[input.elementType];
    const routeError = validateSelection({ ...b, paymentMethods:[method] }, state.paymentRows);
    if (routeError) fail(`Elements ${method}：${routeError}；请先导入商户已确认的支付配置`);
    if (b.paymentMethods && (b.paymentMethods.length !== 1 || b.paymentMethods[0] !== method)) fail('Elements 支付元素必须与所选支付方式一致且只能选择一项');
    allowedMethods = [method];
  } else {
    allowedMethods = b.paymentMethods || [...new Set(compileRows(state.paymentRows).rules.filter(rule => rule.country === b.tradeCountry && rule.currency === b.currency).map(rule => rule.method))];
    if (!allowedMethods.length) fail('OnePage 没有已明确配置的支付方式，禁止初始化');
  }
  b.paymentMethods = [...allowedMethods];
  const merchant = merchants.resolve(env,input.merchantId), cred = { ...merchant.credentials };
  if (!cred.accId || !cred.clientId || !cred.salt) fail('当前环境配置不完整');
  if (duplicateOrder(env,merchant,b.merchantTransactionId)) fail('订单号已存在，请使用新订单号');
  for (const [id, session] of elementSessions) if (session.expiresAt <= Date.now()) elementSessions.delete(id);
  if (elementSessions.size >= 100) fail('待处理的 SDK 会话过多，请稍后重试',429);
  const sessionId = crypto.randomUUID();
  const session = { ...testFlags, mode, env, merchantId:merchant.id, bizContent:b, allowedMethods:[...allowedMethods], paymentVersion:state.paymentVersion, credentialVersion:cred.revision, productionConfirmed:input.productionConfirmed === true, expiresAt:Date.now()+15*60*1000, used:false, ready:false };
  elementSessions.set(sessionId, session);
  const requestTime = new Date().toISOString(), url = new URL('/v4/session/init', endpoint(env)).href;
  const sessionBiz = b.merchantUserId ? { merchantUserId:b.merchantUserId } : {};
  const body = { accId:cred.accId, clientId:cred.clientId, signType:'SHA256', version:'1.0', bizContent:JSON.stringify(sessionBiz) };
  const entry = { ...testFlags, simulated:false, sessionId, mode, action:'session.init', env, endpoint:url, method:'POST', requestTime, startedAt:requestTime, responseTime:null, request:body };
  let stage = 'connect';
  try {
    body.sign = await signBody(body,cred.salt);
    const response = await fetchImpl(url,{ method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'}, body:JSON.stringify(body), redirect:'error', signal:AbortSignal.timeout(15000) });
    entry.httpStatus = response.status || (response.ok ? 200 : 502);
    entry.responseHeadersTime = new Date().toISOString();
    stage = 'read-body';
    let data;
    if (typeof response.text === 'function') { entry.responseText = await response.text(); entry.responseTime = new Date().toISOString(); stage = 'parse-response'; data = JSON.parse(entry.responseText); }
    else { data = await response.json(); entry.responseTime = new Date().toISOString(); }
    stage = 'verify-response';
    entry.response = data; entry.signatureVerified = await verifySign(data,cred.salt);
    if (!response.ok) fail(`${label} 初始化 HTTP 响应失败`,502);
    if (!entry.signatureVerified) fail(`${label} 响应验签失败，禁止交付 SDK 凭证`,502);
    if (typeof data.bizContent !== 'string') fail(`${label} 响应 bizContent 必须为原始字符串`,502);
    stage = 'parse-business';
    const biz = JSON.parse(data.bizContent);
    stage = 'validate-business';
    if (!object(biz)) fail(`${label} 响应业务格式无效`,502);
    for (const source of [data,biz]) for (const key of ['accId','clientId']) if (source[key] !== undefined && source[key] !== cred[key]) fail(`${label} 响应商户身份不匹配`,502);
    if (data.code !== '000000') fail(`${label} 初始化失败（${String(data.code)}）`,502);
    if (typeof biz.sdkAccessToken !== 'string' || !biz.sdkAccessToken.trim()) fail(`${label} 未返回有效 sdkAccessToken`,502);
    session.ready = true;
    const sdkUrl = mode === 'onepage' ? `https://payssr-cdn.pingpongx.com/production-fra/acquirer-checkout-onepage/${env === 'sandbox' ? 'sandbox/' : ''}pp-checkout.js` : `https://acquirer-cdn.pingpongx.com/acquirer/components/sdk/${env}/v1/index.js`;
    return { sessionId, merchantId:merchant.id, productionTestMode:session.productionTestMode, sdkAccessToken:biz.sdkAccessToken, accId:cred.accId, env, region:'fra', sdkUrl, ...(mode === 'onepage' ? {allowedMethods:[...allowedMethods]} : {}) };
  } catch (e) {
    elementSessions.delete(sessionId);
    const cause = e.cause || e;
    const code = typeof cause.code === 'string' ? cause.code : (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'REQUEST_TIMEOUT' : 'UNKNOWN';
    entry.errorStage = stage;
    entry.errorCode = code;
    entry.errorDetail = { name:e.name, message:e.message, cause: e.cause ? {name:cause.name, code:cause.code, message:cause.message} : undefined };
    let reason;
    if (e.status) reason = e.message;
    else if (stage === 'parse-response' || stage === 'parse-business' || e.name === 'SyntaxError') reason = `${label} 初始化响应 JSON 无法解析（HTTP ${entry.httpStatus || '未知'}）`;
    else if (stage === 'read-body') reason = `${label} 已收到 HTTP ${entry.httpStatus} 响应头，但响应正文读取失败（${code}）`;
    else if (code === 'ECONNRESET' && /TLS|secure/i.test(cause.message || '')) reason = `${label} 初始化连接在 TLS 握手完成前被断开（ECONNRESET），未收到 HTTP 响应；请检查当前网络或代理`;
    else if (['ENOTFOUND','EAI_AGAIN'].includes(code)) reason = `${label} 初始化域名解析失败（${code}），请检查 DNS 或代理`;
    else if (code.includes('TIMEOUT') || code === 'ETIMEDOUT') reason = `${label} 初始化请求超时（${code}），未收到 HTTP 响应；请检查网络或代理`;
    else reason = `${label} 初始化网络连接失败（${code}），未收到 HTTP 响应；请检查网络、代理或 TLS 证书`;
    entry.error = reason;
    const error = new Error(reason); error.status = e.status || 502; error.sessionId = sessionId; throw error;
  } finally { entry.completedAt = new Date().toISOString(); entry.durationMs = Date.parse(entry.completedAt) - Date.parse(requestTime); log(entry); }
}
async function handleSdkOrder(input, mode) {
  const label = mode === 'onepage' ? 'OnePage' : 'Elements';
  if (Object.keys(input).some(key => !['sessionId','payMethod','productionTestMode','merchantId'].includes(key))) fail(`${label} 下单只接受 sessionId、payMethod、productionTestMode、merchantId`);
  const session = elementSessions.get(input.sessionId);
  if (!session?.ready || session.mode !== mode || session.expiresAt <= Date.now()) fail(`${label} 会话已失效或模式不匹配，请重新初始化`,409);
  if (session.used) fail(`${label} 会话已发起过下单，请先查询原订单，不可重复提交`,409);
  if (!session.allowedMethods.includes(input.payMethod)) fail('SDK 支付方式与初始化的支付候选不匹配');
  if ((input.productionTestMode === undefined ? false : input.productionTestMode) !== session.productionTestMode) fail('SDK 下单 productionTestMode 与初始化会话不一致');
  if (input.merchantId !== undefined && input.merchantId !== session.merchantId) fail('SDK 会话商户不匹配，请重新初始化',409);
  if (state.selectedMerchantIds[session.env] !== session.merchantId) fail('当前商户已切换，请重新初始化 SDK',409);
  if (merchants.resolve(session.env,session.merchantId).credentials.revision !== session.credentialVersion) fail(`商户配置已变化，请重新初始化 ${label}`,409);
  if (state.paymentVersion !== session.paymentVersion) fail(`支付配置已变化，请重新初始化 ${label}`,409);
  session.used = true;
  const bizContent = { ...session.bizContent, paymentMethods:[input.payMethod] };
  return handlePrepay({ env:session.env, merchantId:session.merchantId, mode, productionConfirmed:session.productionConfirmed, productionTestMode:session.productionTestMode, syntheticProfile:session.syntheticProfile, syntheticAddress:session.syntheticAddress, bizContent }, { sessionId:input.sessionId });
}
const handleElementSession = input => handleSdkSession(input, 'elements');
const handleElementOrder = input => handleSdkOrder(input, 'elements');
const handleOnepageSession = input => handleSdkSession(input, 'onepage');
const handleOnepageOrder = input => handleSdkOrder(input, 'onepage');
async function handlePrepay(input, elementContext) {
  const env = environment(input.env);
  const testFlags = validateProductionData(input);
  if (!['embedded','redirect'].includes(input.mode) && !(['elements','onepage'].includes(input.mode) && elementContext?.sessionId)) fail('mode 无效');
  const b = validateBiz(input.bizContent, env, {rows:state.paymentRows});
  const merchant = merchants.resolve(env,input.merchantId), cred = {...merchant.credentials};
  if (!cred.accId || !cred.clientId || !cred.salt) fail('当前环境配置不完整');
  if (duplicateOrder(env,merchant,b.merchantTransactionId)) fail('订单号已存在，请使用新订单号');
  const body = { accId: cred.accId, clientId: cred.clientId, signType: 'SHA256', version: '1.0', bizContent: JSON.stringify(b) };
  const order = { ...testFlags, simulated:false, id: crypto.randomUUID(), merchantTransactionId: b.merchantTransactionId, env, amount: b.amount, currency: b.currency, tradeCountry:b.tradeCountry, paymentMethods:b.paymentMethods, merchantId:merchant.id, merchantFingerprint:identity(env, cred), notificationUrl:b.notificationUrl, mode: input.mode, requestSummary: { merchantTransactionId:b.merchantTransactionId, amount:b.amount, currency:b.currency, tradeCountry:b.tradeCountry, captureDelayHours:b.captureDelayHours }, status: 'REQUESTING', createdAt: new Date().toISOString() }; saveOrders([order, ...state.orders]);
  activePrepays.add(order.id);
  const requestTime = new Date().toISOString();
  const entry = { ...testFlags, simulated:false, orderId:order.id, ...(elementContext ? { sessionId:elementContext.sessionId } : {}), action:'prepay', env, endpoint:endpoint(env), method:'POST', request:body, requestTime, startedAt:requestTime, responseTime:null };
  try {
    body.sign = await signBody(body,cred.salt);
    if (elementContext) {
      const linked = state.logs.map(item => item.sessionId === elementContext.sessionId ? { ...item, orderId:order.id } : item);
      state.logs = linked;
    }
    const response = await fetchImpl(endpoint(env), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20000) });
    entry.httpStatus = response.status || (response.ok ? 200 : 502);
    let data;
    if (typeof response.text === 'function') {
      entry.responseText = await response.text(); entry.responseTime = new Date().toISOString();
      data = JSON.parse(entry.responseText);
    } else { data = await response.json(); entry.responseTime = new Date().toISOString(); }
    entry.response = data; entry.signatureVerified = await verifySign(data, cred.salt);
    if (!response.ok) fail('支付服务 HTTP 响应失败');
    if (!entry.signatureVerified) fail('响应签名缺失或验签失败，禁止交付支付会话');
    for (const key of ['accId','clientId']) if (data[key] !== undefined && data[key] !== cred[key]) fail('响应商户身份不匹配');
    let biz = {};
    if (data.bizContent !== undefined && data.bizContent !== null && data.bizContent !== '') {
      if (typeof data.bizContent !== 'string') fail('响应 bizContent 必须是原始字符串');
      biz = JSON.parse(data.bizContent); if (!object(biz)) fail('响应 bizContent 无效');
    } else if (data.code === '000000') fail('响应 bizContent 必须是原始字符串');
    for (const key of ['accId','clientId']) if (biz[key] !== undefined && biz[key] !== cred[key]) fail('响应商户身份不匹配');
    if (biz.merchantTransactionId !== undefined && biz.merchantTransactionId !== b.merchantTransactionId) fail('响应订单号不匹配');
    if (data.code !== '000000') {
      if (state.orders.find(o => o.id === order.id)?.status === 'REQUESTING') updateOrder(order.id, { status:'FAILED', responseSummary: { code:data.code, signatureVerified:true } });
      return { code:data.code, description:typeof data.description === 'string' ? data.description : '', bizContent:{}, _meta:{env,orderId:order.id,signatureVerified:true} };
    }
    if (state.orders.find(o => o.id === order.id)?.status === 'REQUESTING') updateOrder(order.id, { responseSummary:{ code:data.code, signatureVerified:true }, status: data.code === '000000' ? 'CREATED' : 'FAILED', ...(typeof biz.transactionId === 'string' ? { transactionId: biz.transactionId } : {}) });
    const delivered = {}; if (data.code === '000000') for (const key of ['token','paymentUrl','innerJsUrl','transactionId','merchantTransactionId']) if (typeof biz[key] === 'string') delivered[key] = biz[key];
    return { code: data.code, description: typeof data.description === 'string' ? data.description : '', bizContent: delivered, _meta: { env, orderId: order.id, signatureVerified: true } };
  } catch (e) { entry.error = e.status ? e.message : '支付请求失败或响应无法解析'; if (state.orders.find(o => o.id === order.id)?.status === 'REQUESTING') updateOrder(order.id, { status: 'UNKNOWN' }); if (e.status) throw e; fail('支付请求失败或响应无效；请核对服务端状态后再发起新请求', 502); }
  finally { try { entry.completedAt = new Date().toISOString(); log(entry); } finally { activePrepays.delete(order.id); } }
}

// These dispatchers run in the page. Only signed gateway requests and public IP lookups use fetch.
export async function api(path) {
  const url = new URL(path,location.href);
  switch (url.pathname) {
    case '/api/config': return publicConfig();
    case '/api/orders': return {orders:state.orders.map(({notificationUrl,...order}) => order)};
    case '/api/orders/logs': return {logs:state.logs.filter(entry => entry.orderId === url.searchParams.get('id'))};
    case '/api/elements/logs': return {logs:state.logs.filter(entry => entry.sessionId === url.searchParams.get('sessionId'))};
    case '/api/profiles': return publicProfiles();
    case '/api/payment-config': return {rows:structuredClone(state.paymentRows),version:state.paymentVersion};
    case '/api/test-address': return testAddress(url.searchParams.get('country'));
    case '/api/public-ip': return getPublicIP(url.searchParams.get('refresh') === '1');
    default: fail('未知的工作台请求');
  }
}

function clearSession() {
  merchants.clear();
  elementSessions.clear();
  state.logs = [];
}
window.addEventListener('pagehide',clearSession);
window.addEventListener('pageshow',event => { if (event.persisted) location.reload(); });

export async function post(path,input) {
  switch (path) {
    case '/api/env':
      useEnvironment(input.env);
      return publicConfig();
    case '/api/config/select': return selectMerchant(input);
    case '/api/config/clear':
      clearSession();
      return publicConfig();
    case '/api/import': return importWorkbook(input.files ?? input.base64,input.strategy);
    case '/api/profiles/preview': return previewProfiles(input.base64);
    case '/api/profiles': return saveProfiles(input);
    case '/api/payment-config': return savePaymentConfig(input);
    case '/api/prepay': return handlePrepay(input);
    case '/api/elements/session': return handleElementSession(input);
    case '/api/elements/order': return handleElementOrder(input);
    case '/api/onepage/session': return handleOnepageSession(input);
    case '/api/onepage/order': return handleOnepageOrder(input);
    case '/api/orders/action': return handleAction(input);
    case '/api/orders/delete': return deleteOrder(input);
    default: fail('未知的工作台操作');
  }
}
export async function download(path) {
  switch (path) {
    case '/api/template.xlsx': return makeTemplate();
    case '/api/profiles/template.xlsx': return profiles.workbook(profiles.defaults(state.paymentRows));
    case '/api/profiles/export.xlsx': return profiles.workbook(state.profileData);
    case '/api/payment-config/template': return JSON.stringify({schemaVersion:1, rows:DEFAULT_ROWS},null,2);
    case '/api/payment-config/export': return JSON.stringify({schemaVersion:1, rows:state.paymentRows},null,2);
    default: fail('未知的下载文件');
  }
}
