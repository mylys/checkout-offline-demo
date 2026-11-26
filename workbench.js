import {importMerchants} from './merchants.js?v=2.1.0';
import {gateway, checkoutUrl} from './gateway.js?v=2.1.0';

const $ = id => document.getElementById(id);
const value = id => $(id).value.trim();
const {countries,currencies,compileRows,validateSelection} = window.CheckoutOptions;
const rules = compileRows().rules;
const envName = env => env === 'production' ? '生产' : '沙箱';
const historyKey = 'checkout-offline-demo.web.receipts.v1';
let merchants = new Map(), selected = {}, busy = false, revision = 0;
let embed, embedTimer;
const records = readRecords();
function readRecords() {
  try {
    const rows = JSON.parse(sessionStorage.getItem(historyKey) || '[]');
    return Array.isArray(rows) ? rows.filter(r => r && typeof r.id === 'string' && typeof r.merchant === 'string') : [];
  } catch { return []; }
}
function saveRecords() {
  // Receipts contain only order metadata and a merchant fingerprint. Never store credentials, tokens or form data.
  try { sessionStorage.setItem(historyKey, JSON.stringify(records)); } catch { /* Orders remain available in this page. */ }
  drawHistory();
}
function blankCheckout() {
  clearTimeout(embedTimer); embed = null;
  $('checkout').replaceChildren();
}
function labelOf(m) {
  return (m.remark || '未命名商户') + ' · ' + m.accId.slice(-6) + ' / ' + m.clientId.slice(-4);
}
function drawMerchants() {
  const env = value('env');
  const rows = [...merchants.values()].filter(m => m.env === env);
  const options = rows.map((m,i) => new Option((i+1) + '. ' + labelOf(m),m.id));
  $('merchant').replaceChildren(...(options.length ? options : [new Option('请导入当前环境的商户 Excel','')]));
  if (rows.length) {
    if (!rows.some(m => m.id === selected[env])) selected[env] = rows[0].id;
    $('merchant').value = selected[env];
  }
  $('merchant-label').textContent = '交易商户（' + rows.length + '）';
  $('merchant').disabled = !rows.length;
  $('submit').disabled = !rows.length;
  $('clear').hidden = !merchants.size;
  drawHistory();
}
function setBusy(flag) { busy = flag; $('controls').disabled = flag; drawHistory(); }
function forget() {
  revision++; merchants.clear(); selected = {}; blankCheckout();
  $('files').value = '';
  $('import-status').textContent = '本页商户已清空，请重新导入。';
  drawMerchants();
}
$('clear').onclick = forget;
window.addEventListener('pagehide', () => {
  forget();
  if ($('confirm-order').open) $('confirm-order').close('cancel');
});
$('files').onchange = async event => {
  const files = Array.from(event.target.files);
  if (!files.length || busy) return;
  const start = revision;
  setBusy(true);
  try {
    const next = await importMerchants(files,merchants);
    if (start !== revision) return;
    merchants = next;
    if (![...next.values()].some(m => m.env === value('env'))) $('env').value = next.values().next().value.env;
    blankCheckout(); drawMerchants();
    const count = env => [...next.values()].filter(m => m.env === env).length;
    $('import-status').textContent = '已导入，生产 ' + count('production') + ' 个，沙箱 ' + count('sandbox') + ' 个。请选择本次交易商户。';
  } catch (error) { $('import-status').textContent = '导入失败：' + error.message; }
  finally { $('files').value = ''; setBusy(false); }
};
$('env').onchange = () => { blankCheckout(); drawMerchants(); };
$('merchant').onchange = () => { selected[value('env')] = value('merchant'); blankCheckout(); };
function newId() { $('order-id').value = 'WEB-' + crypto.randomUUID(); }
$('new-id').onclick = newId;
function methods() {
  const options = rules.filter(r => r.country === value('country') && r.currency === value('currency'));
  const old = value('method');
  $('method').replaceChildren(new Option('由收银台决定',''), ...[...new Set(options.map(r=>r.method))].sort().map(m=>new Option(m,m)));
  if (options.some(r=>r.method===old)) $('method').value = old;
}
$('country').onchange = methods; $('currency').onchange = methods;
const addressFields = {country:'国家二字码',state:'州 / 省',city:'城市',street:'街道门牌',postcode:'邮编'};
for (const group of ['billing','shipping']) {
  for (const [key,label] of Object.entries(addressFields)) {
    const field = document.createElement('input'), wrapper = document.createElement('label');
    wrapper.textContent = label;
    field.required = true; field.id = group + '-' + key;
    if (key === 'country') { field.pattern = '[A-Za-z]{2}'; field.maxLength = 2; field.placeholder = '如 HK'; }
    wrapper.append(field); $(group).append(wrapper);
  }
}
function shipping() {
  const physical = value('kind') === 'N';
  const distinct = physical && !$('same-address').checked;
  $('shipping-section').hidden = !physical; $('shipping').hidden = !distinct;
  for (const field of $('shipping').querySelectorAll('input')) field.disabled = !distinct;
}
$('kind').onchange = shipping; $('same-address').onchange = shipping;
function address(group) {
  const result = {};
  for (const key of Object.keys(addressFields)) {
    result[key] = value(group+'-'+key);
    if (!result[key]) throw new Error('请填写完整地址');
  }
  result.country = result.country.toUpperCase(); return result;
}
function publicIp(ip) {
  if (ip.includes(':')) {
    try { const u = new URL('http://[' + ip + ']/'); return /^\[[23][a-f0-9]{3}:/.test(u.hostname); } catch { return false; }
  }
  const parts = ip.split('.');
  if (parts.length!==4 || !parts.every(n=>/^(0|[1-9]\d{0,2})$/.test(n) && Number(n)<256)) return false;
  const [a,b] = parts.map(Number);
  return !(a===0 || a===10 || a===127 || a>=224 || a===169 && b===254 || a===172 && b>=16 && b<=31 || a===192 && b===168 || a===100 && b>=64 && b<=127 || a===198 && (b===18 || b===19));
}
$('find-ip').onclick = async () => {
  const button = $('find-ip'), previous = $('ip').value;
  button.disabled = true;
  const stop = new AbortController(), timer = setTimeout(()=>stop.abort(),8000);
  try {
    const response = await fetch('https://api.ipify.org?format=json',{credentials:'omit',redirect:'error',signal:stop.signal});
    const data = await response.json();
    if (!response.ok || !publicIp(data.ip)) throw new Error();
    if (!busy && $('ip').value===previous) $('ip').value=data.ip;
    button.textContent='重新获取';
  } catch { button.textContent='获取失败，可手工填写'; }
  finally { clearTimeout(timer); button.disabled=false; }
};
function safeUrl(id, image=false) {
  const url = new URL(value(id));
  if (url.username || url.password || (url.protocol !== 'https:' && !(image && url.protocol==='http:'))) throw new Error('请填写有效的 HTTPS 地址');
  if (id==='notify-url' && (url.pathname==='/' || url.search || url.hash || ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new Error('请填写含具体路径且无查询参数的公网 HTTPS 通知地址');
  return url.href;
}
function units(money,currency) {
  if (typeof money !== 'string' || !Object.hasOwn(currencies,currency) || !/^(0|[1-9]\d*)(\.\d+)?$/.test(money) || money.length>24) throw new Error('订单金额格式不正确');
  const [whole,part=''] = money.split('.');
  const digits = currencies[currency];
  if (part.slice(digits).replace(/0/g,'')) throw new Error('金额超出币种精度');
  return BigInt(whole + part.slice(0,digits).padEnd(digits,'0'));
}
function collect() {
  const amount = value('amount'), currency = value('currency');
  if (units(amount,currency)<=0n || (amount.split('.')[1] || '').length>currencies[currency]) throw new Error('请填写大于零且符合币种精度的金额');
  if (!publicIp(value('ip'))) throw new Error('请填写买家的公网 IP');
  if (!value('product')) throw new Error('请填写商品名称');
  const biz = {amount,currency,merchantTransactionId:value('order-id'),shopperIP:value('ip'),captureDelayHours:Number(value('capture')),
    customer:{email:value('email')},billingAddress:address('billing'),
    goods:[{name:value('product'),number:'1',unitPrice:amount,virtualProduct:value('kind'),imgUrl:safeUrl('image',true)}],
    payResultUrl:safeUrl('return-url'),payCancelUrl:safeUrl('cancel-url')};
  if (value('kind') === 'N') biz.shippingAddress = $('same-address').checked ? {...biz.billingAddress} : address('shipping');
  if (value('country')) biz.tradeCountry = value('country');
  if (value('method')) biz.paymentMethods = [value('method')];
  if (value('notify-url')) biz.notificationUrl = safeUrl('notify-url');
  const error = validateSelection(biz);
  if (error) throw new Error(error);
  return biz;
}
function confirmOrder(merchant,biz) {
  const dialog = $('confirm-order');
  $('summary').replaceChildren();
  for (const [name,text] of Object.entries({'环境':envName(merchant.env),'交易商户':labelOf(merchant),'订单号':biz.merchantTransactionId,'订单金额':biz.amount+' '+biz.currency})) {
    const dt=document.createElement('dt'), dd=document.createElement('dd');
    dt.textContent=name; dd.textContent=text; $('summary').append(dt,dd);
  }
  $('risk').textContent = merchant.env==='production' ? '将向生产网关发送真实订单，继续付款可能扣款。' : '将向沙箱支付网关发送订单。';
  dialog.returnValue='cancel';
  return new Promise(resolve => {
    dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true});
    dialog.showModal();
  });
}
const states = {UNKNOWN:'结果待核实',CREATED:'已创建，待付款',INIT:'已初始化',PROCESSING:'支付处理中',SUCCESS:'支付成功',FAILED:'支付失败',AUTH_SUCCESS:'授权成功',CANCEL:'已取消',CLOSED:'已关闭'};
function drawHistory() {
  const history = $('history'); history.replaceChildren();
  for (const record of records) {
    const row = document.createElement('div'), info = document.createElement('p'), sub = document.createElement('small'), button = document.createElement('button');
    row.className = 'order-row';
    info.textContent = envName(record.env) + ' · ' + record.amount + ' ' + record.currency + ' · ' + (states[record.status] || states.UNKNOWN);
    sub.textContent = record.id; info.append(sub); button.type = 'button'; button.textContent = '查询支付结果';
    button.disabled = busy || !merchants.has(record.merchant);
    button.onclick = async () => {
      if (busy) return;
      setBusy(true);
      try {
        const biz = {merchantTransactionId:record.id};
        if (record.transactionId) biz.transactionId=record.transactionId;
        const result = await gateway('query',merchants.get(record.merchant),biz);
        if (!['INIT','PROCESSING','SUCCESS','FAILED','AUTH_SUCCESS','CANCEL','CLOSED'].includes(result.status) ||
          !result.transactionId || typeof result.transactionId!=='string' || (record.transactionId && result.transactionId!==record.transactionId) ||
          result.currency!==record.currency || units(result.amount,record.currency)!==units(record.amount,record.currency)) throw new Error('查单响应与订单不匹配');
        if (['SUCCESS','CANCEL','CLOSED'].includes(record.status) && record.status!==result.status) throw new Error('查单结果与原终态冲突，请在商户后台核实');
        record.transactionId=result.transactionId; record.status=result.status; saveRecords();
        $('status-order').textContent='验签通过：' + states[record.status];
      } catch (error) { $('status-order').textContent=error.message; }
      finally { setBusy(false); }
    };
    row.append(info,button); history.append(row);
  }
  if (!records.length) history.textContent = '暂无订单';
}
function displayCheckout(result,merchant,mode) {
  blankCheckout();
  const link = result.paymentUrl ? checkoutUrl(result.paymentUrl) : null;
  if (link) {
    const a = document.createElement('a'); a.href=link; a.textContent='打开 PingPong 收银台'; a.rel='noreferrer';
    $('checkout').append(a);
  }
  if (mode==='redirect') {
    if (!link) throw new Error('网关未返回收银台地址，请查询原订单');
    location.assign(link);
    return;
  }
  const expected = 'https://payssr-cdn.pingpongx.com/production-fra/acquirer-checkout-web/' + (merchant.env==='sandbox'?'sandbox/':'') + 'pp-checkout.js';
  if (!result.token || typeof result.token!=='string' || result.innerJsUrl!==expected) {
    if (!link) throw new Error('网关未返回内嵌会话，请查询原订单');
    $('status-order').textContent='该订单使用跳转收银台，请打开下方链接继续。'; return;
  }
  const frame = document.createElement('iframe');
  frame.title='PingPong 内嵌收银台'; frame.sandbox='allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox'; frame.allow='payment *'; frame.referrerPolicy='no-referrer';
  embed={frame,env:merchant.env,token:result.token};
  frame.src='web-embed.html?v=2.1.0'; $('checkout').append(frame);
  embedTimer=setTimeout(()=>{$('status-order').textContent='内嵌组件尚未就绪。若有收银台链接，可打开同一订单继续付款，或查询原订单。';},30000);
  $('checkout').scrollIntoView({block:'start',behavior:'instant'});
}
window.addEventListener('message',event=>{
  if (!embed || event.source!==embed.frame.contentWindow || event.origin!=='null') return;
  switch (event.data?.checkoutEmbed) {
    case 'init':
      if (embed.token && event.ports.length === 1) {
        const port=event.ports[0]; port.postMessage({env:embed.env,token:embed.token}); port.close(); embed.token=null;
      }
      break;
    case 'ready': clearTimeout(embedTimer); $('status-order').textContent='收银台已就绪'; break;
    case 'error': clearTimeout(embedTimer); $('status-order').textContent='内嵌收银台未能加载，请使用同一订单的收银台链接或查询原订单。'; break;
    case 'result': $('status-order').textContent='支付组件已返回，请查询支付结果。'; break;
  }
});
$('payment').onsubmit = async event => {
  event.preventDefault();
  const merchant = merchants.get(value('merchant'));
  if (busy || !merchant) return;
  setBusy(true);
  try {
    const biz = collect(), mode=value('mode'), start=revision;
    if (records.some(r=>r.id===biz.merchantTransactionId && r.merchant===merchant.id)) throw new Error('该商户订单号已使用，请先查询原订单。新交易请生成新号。');
    if (!await confirmOrder(merchant,biz) || revision!==start) return;
    blankCheckout();
    const record = {id:biz.merchantTransactionId,merchant:merchant.id,env:merchant.env,amount:biz.amount,currency:biz.currency,status:'UNKNOWN'};
    records.unshift(record); saveRecords();
    $('status-order').textContent='正在提交 '+record.id;
    const result = await gateway('prePay',merchant,biz);
    if (revision!==start) return;
    if (typeof result.transactionId==='string') record.transactionId=result.transactionId;
    record.status='CREATED'; saveRecords();
    $('status-order').textContent='订单已创建，请在收银台继续付款。';
    displayCheckout(result,merchant,mode);
  } catch (error) { $('status-order').textContent=error.message; $('status-order').scrollIntoView({block:'nearest'}); }
  finally { setBusy(false); }
};
for (const currency of Object.keys(currencies).filter(code=>rules.some(r=>r.currency===code))) $('currency').add(new Option(currency,currency));
for (const c of countries) $('country').add(new Option(c.label,c.value));
for (const [id,type] of [['return-url','return'],['cancel-url','cancel']]) {
  const url = new URL('return.html', location.protocol === 'https:' ? location.href : 'https://mylys.github.io/checkout-offline-demo/');
  url.searchParams.set('via','web'); url.searchParams.set('flow',type); $(id).value = url.href;
}
newId(); methods(); shipping(); drawMerchants();
