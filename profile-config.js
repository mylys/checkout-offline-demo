import {ipVersion, newWorkbook, decode} from './workbook.js?v=2.2.1';
const { countries, currencies, rows: defaultRows, compileRows } = globalThis.CheckoutOptions;
const BASE = ['id','name','country','paymentMethod','currency','synthetic'];
const SHEETS = {
  countries: { name:'国家', fields:[...BASE,'language'] },
  products: { name:'商品', fields:[...BASE,'productName','productType','unitPrice','quantity','productImageUrl','productDescription'] },
  buyers: { name:'买家', fields:[...BASE,'customerEmail','language','shopperIP'] },
  advanced: { name:'高级', fields:[...BASE,'merchantUserId','captureDelayHours'] },
  callbacks: { name:'回调', fields:[...BASE,'payResultUrl','payCancelUrl','notificationUrl'] },
  shipping: { name:'配送', fields:[...BASE,'addressCountry','state','city','street','postcode'] },
  billing: { name:'账单', fields:[...BASE,'sameAsShipping','addressCountry','state','city','street','postcode'] },
  rules: { name:'匹配规则', fields:['id','name','country','paymentMethod','currency','productId','buyerId','advancedId','callbackId','shippingId','billingId'] }
};
const REFERENCES = { productId:'products', buyerId:'buyers', advancedId:'advanced', callbackId:'callbacks', shippingId:'shipping', billingId:'billing' };
const DIMENSIONS = ['country','paymentMethod','currency'];
const MAX_ROWS = 500;
const regions = {
  MY:['Kuala Lumpur','Kuala Lumpur','50000','en','MYR'], ID:['DKI Jakarta','Jakarta','10110','id','IDR'],
  JP:['Tokyo','Shinjuku','160-0022','ja','JPY'], VN:['Ho Chi Minh','Ho Chi Minh','70000','vi','VND'],
  TH:['Bangkok','Bangkok','10110','th','THB'], PH:['Metro Manila','Manila','1000','en','PHP'],
  HK:['Hong Kong, China','Hong Kong, China','000000','zh','HKD'], CN:['Guangdong','Shenzhen','518000','zh','CNY'],
  KR:['Seoul','Gangnam-gu','06236','ko','KRW'], SG:['Singapore','Singapore','018956','en','SGD']
};
function emptyData() { return Object.fromEntries(Object.keys(SHEETS).map(key => [key, []])); }
export function geographicPresets(routes) {
  return countries.filter(({value}) => routes.some(rule => rule.country === value)).map(({value:country,label:name}) => {
    const options = routes.filter(rule => rule.country === country);
    const [,,,language,preferred] = regions[country];
    const currency = options.find(rule => rule.currency === preferred)?.currency || options[0].currency;
    return {id:'@country-' + country, country, name, language, currency};
  });
}
function defaults(paymentRows = defaultRows) {
  const data = emptyData(), valid = compileRows(paymentRows).rules;
  for (const { value:country, label } of countries) {
    const [state,city,postcode,language,preferred] = regions[country];
    const available = valid.filter(row => row.country === country);
    const currency = available.find(row => row.currency === preferred)?.currency || available[0]?.currency || '';
    const base = { country,paymentMethod:'',currency:'',synthetic:true };
    data.countries.push({ ...base,id:`country-${country}`,name:label,currency,language });
    for (const variant of [1,2]) {
      const suffix = `${country}-${variant}`, name = `${label}合成示例${variant}（仅沙箱）`;
      data.products.push({ ...base,id:`product-${suffix}`,name,productName:`${label}沙箱测试商品${variant}`,productType:variant === 1 ? 'N' : 'Y',unitPrice:variant === 1 ? '10' : '20',quantity:'1',productImageUrl:'https://placehold.co/300x300.png',productDescription:'test goods（合成沙箱测试商品，示例图片请按需替换）' });
      data.buyers.push({ ...base,id:`buyer-${suffix}`,name,customerEmail:`sandbox-${country.toLowerCase()}-${variant}@example.com`,language,shopperIP:'' });
      data.shipping.push({ ...base,id:`shipping-${suffix}`,name,addressCountry:country,state,city,street:`${variant} Sandbox Test Street (Synthetic)`,postcode });
      data.billing.push({ ...base,id:`billing-${suffix}`,name,sameAsShipping:variant === 1,addressCountry:variant === 1 ? '' : country,state:variant === 1 ? '' : state,city:variant === 1 ? '' : city,street:variant === 1 ? '' : `${variant} Sandbox Billing Street (Synthetic)`,postcode:variant === 1 ? '' : postcode });
      if (available.length && variant === 1) {
        data.rules.push({ id:`rule-${suffix}`,name,country,paymentMethod:'',currency:'',productId:`product-${suffix}`,buyerId:`buyer-${suffix}`,advancedId:'advanced-sandbox',callbackId:'callback-sandbox',shippingId:`shipping-${suffix}`,billingId:`billing-${suffix}` });
      }
    }
    if (country === 'SG') for (const [index,method] of ['WeChat Pay','Paynow','TNG eWallet'].entries()) {
      const exact = available.find(row => row.method === method && row.currency === currency);
      if (!exact) continue;
      const variant = index % 2 + 1, suffix = `${country}-${variant}`;
      data.rules.push({ id:`rule-SG-method-${index+1}`,name:`新加坡${method}合成沙箱套${variant}`,country,paymentMethod:method,currency:exact.currency,productId:`product-${suffix}`,buyerId:`buyer-${suffix}`,advancedId:'advanced-sandbox',callbackId:'callback-sandbox',shippingId:`shipping-${suffix}`,billingId:`billing-${suffix}` });
    }
  }
  data.advanced.push({ id:'advanced-sandbox',name:'合成沙箱参数',country:'',paymentMethod:'',currency:'',synthetic:true,merchantUserId:'sandbox-synthetic-user',captureDelayHours:'0' });
  data.callbacks.push({ id:'callback-sandbox',name:'沙箱 HTTPS 回跳',country:'',paymentMethod:'',currency:'',synthetic:true,payResultUrl:'{{origin}}/?result=return',payCancelUrl:'{{origin}}/?result=cancel',notificationUrl:'' });
  return data;
}
function validateProfiles(input, paymentRows, { fail,minor,checkUrl }) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !Object.hasOwn(SHEETS,k))) fail('资料配置必须包含八类已知数组');
  const data = emptyData(), indexes = {}, valid = compileRows(paymentRows).rules;
  let count = 0;
  for (const [key,sheet] of Object.entries(SHEETS)) {
    if (!Array.isArray(input[key]) || input[key].length > MAX_ROWS) fail(`${sheet.name}必须是最多${MAX_ROWS}行的数组`);
    indexes[key] = new Map();
    count += input[key].length; if (count > 2000) fail('资料配置总行数不能超过2000');
    for (const source of input[key]) {
      if (!source || typeof source !== 'object' || Array.isArray(source) || Object.keys(source).some(k => !sheet.fields.includes(k))) fail(`${sheet.name}包含未知字段或无效行`);
      const row = {};
      for (const field of sheet.fields) {
        const boolean = field === 'synthetic' || field === 'sameAsShipping';
        const value = source[field] === undefined ? (boolean ? false : '') : source[field];
        if (boolean ? typeof value !== 'boolean' : typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(`${sheet.name}.${field} 必须为${boolean ? '布尔值' : '有效文本'}`);
        row[field] = value;
      }
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(row.id) || indexes[key].has(row.id)) fail(`${sheet.name} id 无效或重复`);
      if (!row.name.trim()) fail(`${sheet.name} name 不能为空`);
      if (row.country && !countries.some(c => c.value === row.country)) fail(`${sheet.name} country 不受支持`);
      if (row.currency && !Object.hasOwn(currencies,row.currency)) fail(`${sheet.name} currency 不受支持`);
      if ((row.paymentMethod || row.currency) && !valid.some(r => (!row.country || r.country === row.country) && (!row.paymentMethod || r.method === row.paymentMethod) && (!row.currency || r.currency === row.currency))) fail(`${sheet.name} 国家、支付方式与币种组合未配置`);
      if (key === 'countries' && !row.country) fail('国家资料 country 不能为空');
      if (key === 'products') {
        if (!row.productName.trim() || !['N','Y'].includes(row.productType)) fail('商品名称或 productType 无效（须为 N/Y）');
        if (!/^[1-9]\d{0,8}$/.test(row.quantity)) fail('quantity 必须为正整数字符串');
        if (minor(row.unitPrice,row.currency || undefined,'unitPrice') <= 0n) fail('商品单价必须大于0');
        if (row.productImageUrl) {
          let u; try { u = new URL(row.productImageUrl); } catch { fail('productImageUrl 无效'); }
          if (!['http:','https:'].includes(u.protocol) || u.username || u.password || row.productImageUrl.length > 255) fail('productImageUrl 必须为不超过255字符且不带凭据的 HTTP(S) URL');
        }
      }
      if (key === 'buyers') {
        if (row.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.customerEmail)) fail('customerEmail 无效');
        if (row.shopperIP && !ipVersion(row.shopperIP)) fail('shopperIP 无效；空值表示保留动态公网IP');
      }
      if (key === 'advanced' && row.captureDelayHours && (!/^(?:-1|0|[1-9]\d{0,2})$/.test(row.captureDelayHours) || Number(row.captureDelayHours) > 168)) fail('captureDelayHours 须为 -1 至168的整数字符串或空');
      if (key === 'callbacks') for (const field of ['payResultUrl','payCancelUrl','notificationUrl']) if (row[field]) {
        if (row[field].includes('{{')) {
          if (field === 'notificationUrl' || !row.synthetic || !/^\{\{origin\}\}\/(?!\/)/.test(row[field]) || row[field].slice(10).includes('{{')) fail('仅 synthetic 沙箱回跳允许 {{origin}}/ 模板');
          checkUrl(row[field].replace('{{origin}}','http://localhost:8787'),field,'sandbox');
        } else checkUrl(row[field],field,row.synthetic ? 'sandbox' : 'production');
      }
      if (['shipping','billing'].includes(key)) {
        if (row.addressCountry && !/^[A-Z]{2}$/.test(row.addressCountry)) fail('addressCountry 必须为两位国家代码');
        if (!(key === 'billing' && row.sameAsShipping)) for (const field of ['addressCountry','state','city','street','postcode']) if (!row[field].trim()) fail(`${sheet.name}.${field} 不能为空`);
      }
      indexes[key].set(row.id,row); data[key].push(row);
    }
  }
  const signatures = new Set();
  for (let i = 0; i < data.rules.length; i++) {
    const rule = data.rules[i];
    const matches = valid.filter(r => (!rule.country || r.country === rule.country) && (!rule.paymentMethod || r.method === rule.paymentMethod) && (!rule.currency || r.currency === rule.currency));
    if (DIMENSIONS.some(d => rule[d]) && !matches.length) fail('匹配规则引用未配置的国家、支付方式与币种组合');
    const signature = JSON.stringify(DIMENSIONS.map(d => rule[d]));
    if (signatures.has(signature)) fail('匹配规则条件重复或存在歧义'); signatures.add(signature);
    for (const [field,key] of Object.entries(REFERENCES)) if (rule[field]) {
      const profile = indexes[key].get(rule[field]);
      if (!profile) fail(`匹配规则 ${field} 引用不存在`);
      if (DIMENSIONS.some(d => profile[d] && profile[d] !== rule[d])) fail(`匹配规则 ${field} 与资料适用条件不一致`);
      if (key === 'products') for (const currency of new Set(matches.map(r => r.currency))) minor(profile.unitPrice,currency,'规则商品单价');
    }
  }
  return data;
}
function summary(data) { const counts = Object.fromEntries(Object.keys(SHEETS).map(k => [k,data[k].length])); return { ...counts,total:Object.values(counts).reduce((a,b) => a+b,0) }; }
async function workbook(data) {
  const wb = await newWorkbook();
  for (const [key,sheet] of Object.entries(SHEETS)) {
    const ws = wb.addWorksheet(sheet.name);
    ws.columns = sheet.fields.map(field => ({ header:field,key:field,width:field.endsWith('Url') ? 40 : 22,style:{numFmt:'@'} }));
    ws.addRows(data[key].map(row => Object.fromEntries(sheet.fields.map(field => [field,typeof row[field] === 'boolean' ? String(row[field]) : row[field]]))));
    ws.views = [{state:'frozen',ySplit:1}]; ws.getRow(1).font = {bold:true};
  }
  const help = wb.addWorksheet('使用说明');
  help.columns = [{header:'字段',key:'field',width:35},{header:'说明',key:'help',width:105}];
  help.addRows([
    ['schemaVersion','1；八个资料Sheet必须齐全，表头使用英文key，单元格均为文本，不接受公式、超链接、富文本。'],
    ['id / name','每类内id唯一，匹配规则用各类Id引用；不得删除被引用资料。'],
    ['country / paymentMethod / currency','空表示通用；仅使用支付配置中明确合法的组合，国家资料默认币种必须来自该国合法组合。'],
    ['synthetic','true为合成测试资料，仅限沙箱；false为自行填写的真实资料。所有示例均为true，不可用于生产。'],
    ['unitPrice / quantity / captureDelayHours','必须为文本，保留金额原始精度；商品N实物/Y虚拟；captureDelayHours可空或-1至168。'],
    ['shopperIP','空表示不覆盖动态取得的公网IP；不要把示例地址用于真实付款。'],
    ['payResultUrl / payCancelUrl','{{origin}}/仅用于synthetic=true的沙箱回跳；notificationUrl可空，不支持本机或模板。'],
    ['sameAsShipping','true表示账单同配送，无需填写账单地址；false时需完整地址。'],
    ['匹配规则','按国家+方式+币种非空条件数量降序匹配，同优先级按规则数组顺序选择；完全重复条件禁止。导入仅预览，点击保存后全量覆盖。'],
    ['productImageUrl','默认使用公开示例占位图，仅供沙箱，可替换为实际商品主图链接。']
  ]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
async function parseWorkbook(base64,paymentRows,helpers) {
  const { fail,checkZip } = helpers;
  if (typeof base64 !== 'string' || base64.length > Math.ceil(1024*1024/3)*4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) fail('base64 无效或超过1MB');
  const buffer = decode(base64); checkZip(buffer);
  const wb = await newWorkbook(); try { await wb.xlsx.load(buffer); } catch { fail('xlsx 工作簿无法读取'); }
  const allowedNames = [...Object.values(SHEETS).map(s => s.name),'使用说明'];
  if (wb.worksheets.some(ws => !allowedNames.includes(ws.name))) fail('发现未知工作表');
  const data = emptyData();
  for (const ws of wb.worksheets) {
    if (ws.rowCount > MAX_ROWS+1 || ws.columnCount > 40) fail('工作表超过行列限制');
    ws.eachRow(row => row.eachCell(cell => { if (cell.value !== null && typeof cell.value === 'object') fail('不接受公式、超链接或富文本单元格'); }));
  }
  for (const [key,sheet] of Object.entries(SHEETS)) {
    const ws = wb.getWorksheet(sheet.name); if (!ws) fail(`缺失工作表：${sheet.name}`);
    const headers = new Map();
    ws.getRow(1).eachCell((cell,n) => { if (typeof cell.value !== 'string' || !sheet.fields.includes(cell.value) || headers.has(cell.value)) fail(`${sheet.name} 表头无效、未知或重复`); headers.set(cell.value,n); });
    if (headers.size !== sheet.fields.length) fail(`${sheet.name} 缺失必需表头`);
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r), output = {}; let present = false;
      row.eachCell((cell,n) => { if (cell.value != null && ![...headers.values()].includes(n)) fail('发现未知列数据'); });
      for (const [field,n] of headers) {
        const value = row.getCell(n).value;
        if (value !== null && value !== '') present = true;
        const boolean = field === 'synthetic' || field === 'sameAsShipping';
        if (boolean) {
          if (![null,'',true,false,'true','false'].includes(value)) fail(`${field} 必须为 true/false`);
          output[field] = value === true || value === 'true';
        } else {
          if (value !== null && typeof value !== 'string') fail(`${field} 必须为文本单元格，避免金额、ID和邮编精度丢失`);
          output[field] = value ?? '';
        }
      }
      if (present) data[key].push(output);
    }
  }
  return validateProfiles(data,paymentRows,helpers);
}
export { SHEETS,defaults,validateProfiles,workbook,parseWorkbook,summary };
