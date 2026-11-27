import {api,post,download} from './browser-api.js?v=2.2.0';
let currentEnv = 'production';
let currentMode = 'redirect';
let config = null;
let orders = [];
let selectedOrderId = null;
let busy = false;
let sandboxFixture = false;
let sessionGeneration = 0;
let configRevision = 0;
const $ = id => document.getElementById(id);
let helpTrigger = null;
function openHelp(button) {
  const sources = (button.dataset.helpSource || '').split(/\s+/).filter(Boolean);
  const message = [button.dataset.help, ...sources.map(id => $(id)?.textContent.trim())].filter(Boolean).join('\n\n');
  if (!message) return;
  helpTrigger = button;
  $('helpTitle').textContent = button.dataset.helpTitle || '说明';
  $('helpContent').textContent = message;
  if (!$('helpDialog').open) $('helpDialog').showModal();
}
$('closeHelp').onclick = () => $('helpDialog').close();
$('helpDialog').addEventListener('close', () => {
  if (helpTrigger?.isConnected) helpTrigger.focus();
  helpTrigger = null;
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-help], [data-help-source]');
  if (!button) return;
  event.preventDefault();
  openHelp(button);
});
function setAuxStatus(id, message, tone = 'info') {
  const status = $(id);
  status.textContent = message;
  status.hidden = tone === 'info';
  status.classList.toggle('error', tone === 'error');
  status.setAttribute('aria-busy', String(tone === 'progress'));
}
const checkoutOptions = window.CheckoutOptions;
let paymentRows = checkoutOptions.rows || [];
let paymentRules = [];
let paymentPreview = null;
let orderNumberEdited = false;
let amountEdited = false;
let methodDraft = null;
function setMethodError(message) {
  $('methodError').textContent = message;
  $('methodSelection').setCustomValidity(message);
  $('methodSelection').setAttribute('aria-invalid', String(!!message));
}
function showSelectedMethods() {
  setMethodError('');
  $('methodSelection').value = [...selectedMethods].join('、');
  $('methodSelection').title = $('methodSelection').value;
  $('paymentMethods').value = [...selectedMethods].join(',');
}
function routeMethods() {
  const country = $('tradeCountry').value, currency = $('currency').value;
  return country && currency ? [...new Set(paymentRules.filter(rule => rule.country === country && rule.currency === currency).map(rule => rule.method))] : [];
}
function commitMethodText(raw, format) {
  const available = new Map(routeMethods().map(name => [name.toLowerCase(), name]));
  const tokens = raw.split(/[,，、]/).map(name => name.trim()).filter(Boolean);
  const unknown = tokens.find(name => !available.has(name.toLowerCase()));
  const error = unknown ? `当前国家／币种不支持支付方式：${unknown}` : raw.trim() && !tokens.length ? '请输入支付方式名称，或清空此栏' : '';
  const wasInvalid = !!$('methodError').textContent;
  const previous = $('paymentMethods').value;
  selectedMethods.clear();
  if (!error) for (const token of tokens) selectedMethods.add(available.get(token.toLowerCase()));
  $('paymentMethods').value = [...selectedMethods].join(',');
  $('methodSelection').value = format && !error ? [...selectedMethods].join('、') : raw;
  $('methodSelection').title = $('methodSelection').value;
  setMethodError(error);
  if (!error && (wasInvalid || previous !== $('paymentMethods').value)) applyMatchingProfiles();
  updateRequired();
}
function renderMethodDraft() {
  const methods = routeMethods();
  const query = $('methodSearch').value.trim().toLowerCase();
  const visible = methods.filter(name => name.toLowerCase().includes(query));
  $('methodCount').textContent = `已选 ${methodDraft.size} 项`;
  const empty = !$('tradeCountry').value || !$('currency').value ? '请先选择国家／地区和币种' : !methods.length ? '当前国家和币种没有可选支付方式' : '没有匹配的支付方式';
  $('methodOptions').innerHTML = visible.length ? `<fieldset><legend>可选支付方式</legend>${visible.map(name => `<label class="method-choice"><input type="checkbox" value="${escapeHtml(name)}" ${methodDraft.has(name) ? 'checked' : ''} /><span>${escapeHtml(name)}</span></label>`).join('')}</fieldset>` : `<p class="config-help">${empty}</p>`;
}
const generatedOrderNumbers = new Set();
let pendingAction = null;
let orderActionBusy = false;
let syntheticAddress = false;
let syntheticProfile = false;
let profiles = null;
let profilesPreview = null;
let profilesBusy = false;
let profilesPreviewVersion = null;
const profileSections = {
  products: { select:'productPreset', reference:'productId', label:'商品', fields:['productName','productType','unitPrice','quantity','productImageUrl','productDescription'] },
  buyers: { select:'buyerPreset', reference:'buyerId', label:'买家', fields:['customerEmail','language','shopperIP'] },
  advanced: { select:'advancedPreset', reference:'advancedId', label:'高级参数', fields:['merchantUserId','captureDelayHours'] },
  callbacks: { select:'callbackPreset', reference:'callbackId', label:'回调', fields:['payResultUrl','payCancelUrl','notificationUrl'] },
  shipping: { select:'shippingPreset', reference:'shippingId', label:'配送地址' },
  billing: { select:'billingPreset', reference:'billingId', label:'账单地址' }
};
let addressRevision = 0;
let addressRequest = 0;
let ipRevision = 0;
let ipRequest = 0;
const selectedMethods = new Set();
function rebuildRules() { paymentRules = checkoutOptions.compileRows(paymentRows).rules; }
function setSelectOptions(id, values, labels = {}) {
  const element = $(id), previous = element.value;
  element.innerHTML = '<option value="">请选择</option>' + [...new Set(values)].sort().map(value => `<option value="${escapeHtml(value)}">${escapeHtml(labels[value] ? `${labels[value]}（${value}）` : value)}</option>`).join('');
  element.value = values.includes(previous) ? previous : '';
}
function renderRouting() {
  const country = $('tradeCountry').value;
  const labels = Object.fromEntries(checkoutOptions.countries.map(item => [item.value, item.label]));
  setSelectOptions('tradeCountry', paymentRules.map(rule => rule.country), labels);
  setSelectOptions('currency', paymentRules.filter(rule => !country || rule.country === country).map(rule => rule.currency));
  renderMethodOptions();
}
function renderMethodOptions() {
  const country = $('tradeCountry').value, currency = $('currency').value;
  if ($('methodDialog').open) $('methodDialog').close();
  const methods = routeMethods();
  if (currentMode === 'elements') {
    const method = elementMethods[$('elementType').value];
    selectedMethods.clear();
    if (method && methods.includes(method)) selectedMethods.add(method);
    setAuxStatus('elementRouteStatus', !method ? '请选择组件；支付方式将按组件精确同步。' : methods.includes(method) ? `已匹配 ${country} / ${currency} / ${method}，支付方式由组件选择锁定。` : `${method} 在所选国家／币种下没有明确支付路由；请在支付配置中导入经官方或商户确认的 ${method} 组合后再发起交易，不会自动补充或猜测映射。`, method && !methods.includes(method) ? 'error' : 'info');
  }
  $('methodSelection').readOnly = currentMode === 'elements';
  $('openMethodFilter').disabled = currentMode === 'elements';
  $('openMethodFilter').title = currentMode === 'elements' ? '支付方式由组件选择锁定' : '';
  if (currentMode === 'elements' || !$('methodSelection').validationMessage) showSelectedMethods();
  else commitMethodText($('methodSelection').value, false);
}
function initOptions() {
  rebuildRules(); renderRouting();
  $('tradeCountry').onchange = () => { selectedMethods.clear(); showSelectedMethods(); addressRequest++; $('currency').value = ''; renderRouting(); selectCountryDefaults(); applyMatchingProfiles(); updateRequired(); synchronizeAmount(amountEdited ? 'amount' : 'quantity'); };
  $('currency').onchange = () => { selectedMethods.clear(); showSelectedMethods(); renderRouting(); syncCountryPreset(); applyMatchingProfiles(); updateRequired(); synchronizeAmount(amountEdited ? 'amount' : 'quantity'); };
  const field = $('methodSelection');
  field.oninput = () => currentMode === 'elements' ? showSelectedMethods() : commitMethodText(field.value, false);
  field.onchange = () => currentMode === 'elements' ? showSelectedMethods() : commitMethodText(field.value, true);
  const dialog = $('methodDialog');
  $('openMethodFilter').onclick = () => {
    if (currentMode === 'elements' || dialog.open) return;
    methodDraft = new Set(selectedMethods);
    $('methodSearch').value = '';
    renderMethodDraft(); dialog.showModal(); $('methodSearch').focus();
  };
  $('methodSearch').oninput = () => { if (dialog.open) renderMethodDraft(); };
  $('methodOptions').onchange = ({target}) => {
    if (!dialog.open || !target.matches('input[type="checkbox"]')) return;
    if (target.checked) methodDraft.add(target.value); else methodDraft.delete(target.value);
    $('methodCount').textContent = `已选 ${methodDraft.size} 项`;
  };
  $('clearMethods').onclick = () => { if (dialog.open) { methodDraft.clear(); renderMethodDraft(); } };
  $('applyMethodFilter').onclick = () => {
    if (!dialog.open || currentMode === 'elements') return;
    commitMethodText([...methodDraft].join('、'), true); dialog.close();
  };
  $('cancelMethodFilter').onclick = () => dialog.close();
  dialog.onclose = () => {
    if (dialog.open) return;
    methodDraft = null; $('methodSearch').value = ''; $('methodOptions').replaceChildren();
    if (!document.querySelector('dialog[open]') && !$('openMethodFilter').disabled) $('openMethodFilter').focus();
  };
}
function setEnvironment(env) { currentEnv = env; }
const returnPage = 'https://mylys.github.io/checkout-offline-demo/return.html';
const productionReturns = {payResultUrl:returnPage + '?via=web&flow=return',payCancelUrl:returnPage + '?via=web&flow=cancel'};
const callbackFields = [...Object.keys(productionReturns),'notificationUrl'];
function productionUrl(id, value) {
  const fallback = productionReturns[id] || '';
  if (!value || value.includes('{{origin}}')) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' && !url.username && !url.password) {
      if (['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return id === 'notificationUrl' ? value : fallback;
      url.protocol = 'https:';
      return url.href;
    }
  } catch {}
  return value;
}
function applyProductionUrls() {
  for (const id of callbackFields) $(id).value = productionUrl(id,$(id).value.trim());
}
for (const id of callbackFields) $(id).addEventListener('change', () => {
  const value = $(id).value.trim();
  if (currentEnv === 'production' && /^http:\/\//i.test(value)) $(id).value = productionUrl(id,value) || value;
});
function renderProfileSafety() {
  $('profileSafety').textContent = syntheticProfile || syntheticAddress || sandboxFixture ? '沙箱合成资料' : '';
}
function productionProfileAllowed(item) {
  return currentEnv !== 'production' || (!item.synthetic && !Object.values(item).some(value => typeof value === 'string' && value.includes('{{origin}}')));
}
function applyProductionDefaults() {
  if (currentEnv !== 'production') return;
  const cleared = (syntheticProfile || syntheticAddress || sandboxFixture);
  if (cleared) clearProfileData();
  applyProductionUrls();
  if (!$('quantity').value) $('quantity').value = '1';
  if (!$('captureDelayHours').value) $('captureDelayHours').value = '0';
  renderProfileSelectors(); syncBilling(); synchronizeAmount(amountEdited ? 'amount' : 'quantity'); updateRequired(); renderProfileSafety();
  setAuxStatus('profileStatus', `${cleared ? '已清空沙箱测试业务资料。' : ''}生产基础默认：数量 1、收款延迟 0（立即扣款）；已有手填值保留。成功与取消默认返回 GitHub Pages，可改为商户自己的 HTTPS 回跳地址。`);
}
$('applyProductionDefaults').onclick = applyProductionDefaults;
function renderProfileSelectors() {
  const languages = [...(profiles?.data.countries || []), ...(profiles?.data.buyers || [])].map(item => item.language).filter(Boolean);
  for (const language of new Set(languages)) {
    if (![...$('language').options].some(option => option.value === language)) {
      const option = document.createElement('option'); option.value = language; option.textContent = language; $('language').appendChild(option);
    }
  }
  for (const [section, info] of Object.entries({ countries:{select:'countryPreset'}, ...profileSections })) {
    const select = $(info.select), previous = select.value;
    select.replaceChildren();
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = section === 'countries' ? '手工选择国家' : '手工填写／未选预设'; select.appendChild(empty);
    for (const item of (profiles?.data[section] || []).filter(productionProfileAllowed)) {
      const option = document.createElement('option'); option.value = item.id;
      const name = item.name;
      option.textContent = `${name}${item.synthetic ? ' · 测试' : ''}${item.country ? ` · ${item.country}` : ''}${item.currency ? ` / ${item.currency}` : ''}`;
      if (section === 'countries') option.disabled = !paymentRules.some(rule => rule.country === item.country && (!item.currency || rule.currency === item.currency));
      select.appendChild(option);
    }
    select.value = [...select.options].some(option => option.value === previous) ? previous : '';
  }
}
function syncCountryPreset() {
  const current = profiles?.data.countries.find(item => productionProfileAllowed(item) && item.country === $('tradeCountry').value && (!item.currency || item.currency === $('currency').value));
  $('countryPreset').value = current?.id || '';
}
function selectCountryDefaults(chosen) {
  const country = $('tradeCountry').value;
  if (chosen && !productionProfileAllowed(chosen)) return;
  const candidates = (profiles?.data.countries || []).filter(item => productionProfileAllowed(item) && item.country === country && paymentRules.some(rule => rule.country === country && (!item.currency || rule.currency === item.currency)));
  const item = chosen || candidates.find(item => item.currency === $('currency').value) || candidates[0];
  if (item?.currency) $('currency').value = item.currency;
  else if (!$('currency').value) {
    const currencies = [...new Set(paymentRules.filter(rule => rule.country === country).map(rule => rule.currency))];
    if (currencies.length === 1) $('currency').value = currencies[0];
  }
  if (item?.paymentMethod && !selectedMethods.size && routeMethods().includes(item.paymentMethod)) {
    selectedMethods.add(item.paymentMethod);
    showSelectedMethods();
  }
  if (item?.language) $('language').value = item.language;
  if (item?.synthetic) syntheticProfile = true;
  $('countryPreset').value = item?.id || '';
  renderMethodOptions(); renderProfileSafety();
}
function applyProfile(section, item, automatic = false) {
  const info = profileSections[section];
  if (!item || !info) return;
  if (!productionProfileAllowed(item)) {
    setAuxStatus('profileStatus', '生产环境不应用沙箱测试预设，请填写真实资料。', 'error'); return;
  }
  if (item.synthetic) syntheticProfile = true;
  if (section === 'shipping' || section === 'billing') {
    addressRevision++; addressRequest++;
    if (section === 'billing') $('sameBilling').checked = item.sameAsShipping === true;
    for (const field of addressFields) $(section + field[0].toUpperCase() + field.slice(1)).value = String(item[field === 'country' ? 'addressCountry' : field] ?? '');
    if (item.synthetic) syntheticAddress = true;
    syncBilling();
    if (section === 'shipping' && $('sameBilling').checked) $('billingPreset').value = '';
    setAuxStatus('addressStatus', `已应用${info.label}预设“${item.name}”${item.synthetic ? '（仅限沙箱测试）' : ''}。`);
  } else {
    for (const id of info.fields) {
      let value = String(item[id] ?? '');
      if (id === 'shopperIP') {
        if (!value.trim()) continue;
        ipRevision++; ipRequest++;
        setAuxStatus('ipStatus', '使用买家预设中的 IP，可手工修改。');
      }
      if (section === 'callbacks' && currentEnv === 'production') {
        // 沙箱模板在生产联调使用 HTTPS 回跳，同时保留已填写的商户端点。
        if (automatic && (value.includes('{{origin}}') || !value) && $(id).value) value = $(id).value;
        value = productionUrl(id,value);
      } else if (value.includes('{{origin}}') && ['payResultUrl','payCancelUrl'].includes(id)) {
        value = /^\{\{origin\}\}\/\?result=(return|success|cancel)$/.test(value)
          ? productionReturns[id] : value.replace('{{origin}}/', new URL('./', location.href).href); syntheticProfile = true;
      }
      $(id).value = value;
    }
  }
  $(info.select).value = item.id;
  if (section === 'products') {
    if (!automatic) amountEdited = false;
    synchronizeAmount(amountEdited ? 'amount' : 'quantity');
  }
  updateRequired(); renderProfileSafety();
}
function profileRuleRank(rule, country, currency, method) {
  if (currentEnv === 'production' && Object.entries(profileSections).some(([section, info]) => {
    const item = profiles?.data[section].find(item => item.id === rule[info.reference]);
    return item && !productionProfileAllowed(item);
  })) return -1;
  const wildcard = value => !value || value === '*';
  if (![ ['country',country], ['currency',currency], ['paymentMethod',method] ].every(([key,value]) => wildcard(rule[key]) || rule[key] === value)) return -1;
  return ['country','currency','paymentMethod'].filter(key => !wildcard(rule[key])).length;
}
function applyMatchingProfiles() {
  const country = $('tradeCountry').value, currency = $('currency').value;
  if (!profiles) { setAuxStatus('profileStatus', '资料配置尚未加载，保留现有内容。', 'progress'); return; }
  if (!country || !currency) { setAuxStatus('profileStatus', '请选择合法国家及币种后自动匹配；现有内容保持不变。'); return; }
  const methods = [...new Set(paymentRules.filter(rule => rule.country === country && rule.currency === currency && selectedMethods.has(rule.method)).map(rule => rule.method))];
  const winners = (methods.length ? methods : ['']).map((method, methodIndex) => {
    return profiles.data.rules.map((rule, index) => ({rule,index,method,methodIndex,rank:profileRuleRank(rule,country,currency,method)})).filter(item => item.rank >= 0).sort((a,b) => b.rank - a.rank || a.index - b.index)[0];
  }).filter(Boolean).sort((a,b) => b.rank - a.rank || a.index - b.index || a.methodIndex - b.methodIndex);
  if (!winners.length) { setAuxStatus('profileStatus', `未命中 ${country} / ${currency}${methods.length ? ` / ${methods.join('、')}` : ''} 的资料规则；所有分区保留原内容。`); return; }
  const winner = winners[0], applied = [], kept = [];
  for (const [section, info] of Object.entries(profileSections)) {
    const item = profiles?.data[section].find(item => productionProfileAllowed(item) && item.id === winner.rule[info.reference]);
    if (item) { applyProfile(section, item, true); applied.push(info.label); } else kept.push(info.label);
  }
  const conflict = new Set(winners.map(item => item.rule.id)).size > 1;
  setAuxStatus('profileStatus', `已自动应用“${winner.rule.name}”（${['通用','单维条件','双维条件','精确三元'][winner.rank]}${winner.method ? `，${winner.method}` : ''}）：${applied.join('、') || '无可填入分区'}。${kept.length ? `未命中分区保留原内容：${kept.join('、')}。` : ''}${conflict ? '多支付方式命中不同规则；按匹配条件具体度最高、规则行顺序稳定选首条。' : ''}`);
}
async function refreshProfiles() {
  profiles = await api('/api/profiles');
  renderProfileSelectors();
  $('profilesCurrent').textContent = JSON.stringify(profiles, null, 2);
}
function clearProfileData() {
  addressRevision++; addressRequest++; ipRevision++; ipRequest++;
  for (const info of Object.values(profileSections)) {
    for (const id of info.fields || []) $(id).value = '';
    $(info.select).value = '';
  }
  for (const section of ['shipping','billing']) for (const field of addressFields) $(section + field[0].toUpperCase() + field.slice(1)).value = '';
  amountEdited = false; $('amount').value = ''; $('countryPreset').value = ''; $('sameBilling').checked = true;
  syntheticProfile = false; syntheticAddress = false; sandboxFixture = false;
  syncBilling(); synchronizeAmount('quantity'); updateRequired(); renderProfileSafety();
  setAuxStatus('ipStatus', '已清空资料，请填写真实公网 IP 或重新获取。');
  setAuxStatus('addressStatus', '所有预设涉及的表单资料均已清空，测试标记已解除。');
  setAuxStatus('profileStatus', '已清空所有预设测试资料（不删除保存的配置）；请填真实资料。再次切换路由或选择测试预设会重新填入。');
}
$('clearProfileData').onclick = clearProfileData;
$('countryPreset').onchange = () => {
  const item = profiles?.data.countries.find(item => item.id === $('countryPreset').value); if (!item) return;
  if (!paymentRules.some(rule => rule.country === item.country && (!item.currency || rule.currency === item.currency))) { setAuxStatus('profileStatus', '该国家预设不在当前合法支付组合中，未应用。', 'error'); return; }
  selectedMethods.clear(); showSelectedMethods(); addressRequest++;
  $('tradeCountry').value = item.country; renderRouting(); selectCountryDefaults(item); applyMatchingProfiles(); updateRequired();
};
for (const [section, info] of Object.entries(profileSections)) {
  $(info.select).addEventListener('click', event => event.stopPropagation());
  $(info.select).onchange = () => {
    const item = profiles?.data[section].find(item => item.id === $(info.select).value);
    if (item) { applyProfile(section,item); setAuxStatus('profileStatus', `已手动应用${info.label}预设“${item.name}”；下次国家、币种或支付方式变化时会重新匹配。`); }
  };
  for (const id of info.fields || []) $(id).addEventListener('input', () => { $(info.select).value = ''; });
}
$('openProfiles').onclick = async () => {
  if (profilesBusy) return;
  closeEnvMenu(); profilesPreview = null; $('saveProfiles').disabled = true; $('profilesPreview').textContent = '';
  $('profilesMessage').textContent = '正在读取资料配置…'; $('profilesDialog').showModal();
  try { await refreshProfiles(); $('profilesMessage').textContent = `已读取当前配置（版本 ${profiles.version}）。上传 Excel 后先校验预览，尚未确认不会保存。`; }
  catch (error) { $('profilesMessage').textContent = error.message; }
};
$('closeProfiles').onclick = () => $('profilesDialog').close();
const downloads = {
  '/api/profiles/template.xlsx': ['profiles-template.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '/api/profiles/export.xlsx': ['profiles-export.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '/api/template.xlsx': ['pingpong-checkout-template.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '/api/payment-config/export': ['payment-config.json', 'application/json'],
  '/api/payment-config/template': ['payment-config-template.json', 'application/json'],
};
async function downloadFile(path, statusId) {
  const status = $(statusId);
  status.textContent = '正在准备下载…';
  try {
    const spec = downloads[path];
    const blob = new Blob([await download(path)], {type:spec[1]});
    const objectUrl = URL.createObjectURL(blob), link = document.createElement('a');
    try {
      link.href = objectUrl; link.download = spec[0]; link.hidden = true;
      document.body.appendChild(link); link.click();
      status.textContent = `已发起下载：${spec[0]}`;
    } finally {
      link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }
  } catch (error) { status.textContent = `无法下载：${error.message}。若预览窗口限制下载，可在系统浏览器打开 ${location.origin} 重试。`; }
}
$('downloadProfilesTemplate').onclick = () => downloadFile('/api/profiles/template.xlsx', 'profilesMessage');
$('exportProfiles').onclick = () => downloadFile('/api/profiles/export.xlsx', 'profilesMessage');
function readExcel(file) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('无法读取 Excel 文件'));
    reader.readAsDataURL(file);
  });
}
$('profilesInput').onchange = async event => {
  const file = event.target.files[0]; if (!file || profilesBusy) return;
  profilesBusy = true; profilesPreview = null; $('saveProfiles').disabled = true; $('profilesInput').disabled = true;
  $('profilesPreview').textContent = ''; $('profilesMessage').textContent = '正在校验 Excel，尚未保存…';
  try {
    if (!/\.xlsx$/i.test(file.name)) throw new Error('仅支持 .xlsx 文件');
    if (file.size > 1024 * 1024) throw new Error('Excel 文件超过 1 MB 上限');
    const base64 = await readExcel(file);
    const result = await post('/api/profiles/preview', {base64});
    profilesPreview = result.data; profilesPreviewVersion = result.version;
    $('profilesPreview').textContent = JSON.stringify({summary:result.summary,data:result.data}, null, 2);
    $('profilesMessage').textContent = '校验通过，请核对以下全部 Sheet 内容。点击“确认保存预览配置”才会保存到本标签页；当前表单不自动改动。';
    $('saveProfiles').disabled = false;
  } catch (error) { $('profilesMessage').textContent = error.message; }
  finally { profilesBusy = false; $('profilesInput').disabled = false; event.target.value = ''; }
};
$('saveProfiles').onclick = async () => {
  if (!profilesPreview || profilesBusy) return;
  profilesBusy = true; $('saveProfiles').disabled = true; $('profilesInput').disabled = true;
  try {
    profiles = await post('/api/profiles', {data:profilesPreview,expectedVersion:profilesPreviewVersion});
    profilesPreview = null; renderProfileSelectors(); $('profilesCurrent').textContent = JSON.stringify(profiles,null,2);
    $('profilesMessage').textContent = '资料配置已保存，各分区预设列表已更新。当前表单保持不变；选择预设或改变国家、币种、支付方式后应用。';
  } catch (error) { $('profilesMessage').textContent = error.message; $('saveProfiles').disabled = false; }
  finally { profilesBusy = false; $('profilesInput').disabled = false; }
};
function closeEnvMenu() { $('envMenu').hidden = true; $('envMenuToggle').setAttribute('aria-expanded', 'false'); }
function selectedMerchantId(env = currentEnv) { return config?.selectedMerchantIds?.[env] || ''; }
function selectedMerchant(env = currentEnv) { return (config?.merchants?.[env] || []).find(item => item.id === selectedMerchantId(env)); }
function confirmLocalAction(message) {
  const dialog = $('localConfirmDialog');
  if (dialog.open) return false;
  $('localConfirmText').textContent = message;
  dialog.returnValue = 'cancel';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {once:true});
    dialog.showModal();
  });
}
function renderMerchantOptions() {
  const merchants = config?.merchants?.[currentEnv] || [];
  const labels = merchants.map(item => item.remark?.trim() || '未命名商户');
  const names = new Map(), accounts = new Map();
  const accountKeys = merchants.map((item,i) => JSON.stringify([labels[i],item.accId]));
  labels.forEach((label,i) => {
    names.set(label,(names.get(label) || 0) + 1);
    accounts.set(accountKeys[i],(accounts.get(accountKeys[i]) || 0) + 1);
  });
  const options = merchants.map((item,i) => {
    const account = !item.remark?.trim() || names.get(labels[i]) > 1 ? ` · ${item.accId || '未配置 accId'}` : '';
    const id = accounts.get(accountKeys[i]) > 1 ? ` · ${item.id}` : '';
    return [item.id,labels[i] + account + id];
  });
  if (!options.length) options.push(['',config ? '暂无商户，请在商户设置中导入' : '正在加载商户…']);
  for (const field of ['transactionMerchant','merchantSelect']) {
    const select = $(field);
    select.replaceChildren();
    for (const [value,label] of options) {
      const option = document.createElement('option');
      option.value = value; option.textContent = label; select.appendChild(option);
    }
    select.value = selectedMerchantId();
    select.disabled = busy || !merchants.length;
  }
  $('merchantCount').textContent = config ? `${currentEnv === 'production' ? '生产' : '沙箱'} · ${merchants.length} 个商户` : '';
}
async function openConfigDialog() {
  if (busy) return;
  closeEnvMenu();
  $('configMessage').textContent = '';
  $('configDialog').showModal();
}
$('envMenuToggle').onclick = () => { const open = $('envMenu').hidden; $('envMenu').hidden = !open; $('envMenuToggle').setAttribute('aria-expanded', String(open)); };
$('openMerchantConfig').onclick = openConfigDialog;
$('sessionImport').onclick = openConfigDialog;
$('closeConfig').onclick = () => $('configDialog').close();
$('configDialog').addEventListener('close', () => {
  $('restoreMerchants').checked = false;
  $('excelInput').multiple = true;
});
$('restoreMerchants').onchange = () => { $('excelInput').multiple = !$('restoreMerchants').checked; };
async function switchMerchant(merchantId) {
  if (busy || !merchantId || merchantId === selectedMerchantId()) { renderMerchantOptions(); return; }
  const env = currentEnv;
  clearCheckoutSession(); busy = true; renderConfig();
  try {
    configRevision++;
    config = await post('/api/config/select', { env, merchantId });
    renderConfig();
    $('formError').hidden = true;
  } catch (error) { showError(error); }
  finally { busy = false; renderConfig(); }
}
for (const field of ['transactionMerchant','merchantSelect']) $(field).onchange = () => switchMerchant($(field).value);
document.addEventListener('click', event => { if (!event.target.closest('.environment-menu')) closeEnvMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('envMenu').hidden) { closeEnvMenu(); $('envMenuToggle').focus(); } });
document.addEventListener('focusin', event => { if (!$('envMenu').hidden && !event.target.closest('.environment-menu')) closeEnvMenu(); });
const addressFields = ['country', 'state', 'city', 'street', 'postcode'];
const textFields = ['amount', 'currency', 'merchantTransactionId', 'productName', 'unitPrice', 'customerEmail', 'language', 'shopperIP', 'merchantUserId', 'payResultUrl', 'payCancelUrl', 'notificationUrl', 'tradeCountry', 'paymentMethods'];
function newOrderNo() {
  const now = new Date();
  const stamp = [now.getFullYear() % 100, now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()].map(value => String(value).padStart(2, '0')).join('');
  let candidate;
  do {
    let suffix = '';
    while (suffix.length < 3) { const bytes = crypto.getRandomValues(new Uint8Array(3)); for (const byte of bytes) if (byte < 234 && suffix.length < 3) suffix += String.fromCharCode(65 + byte % 26); }
    candidate = `PP-${stamp}${suffix}`;
  } while (generatedOrderNumbers.has(candidate) || orders.some(order => order.merchantTransactionId === candidate));
  generatedOrderNumbers.add(candidate);
  $('merchantTransactionId').value = candidate;
  orderNumberEdited = false;
}
function moneyPrecision() { return checkoutOptions.currencies[$('currency').value] ?? 6; }
function toMinor(raw, precision = moneyPrecision()) {
  const value = String(raw).trim();
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error('金额必须为非负十进制数字');
  const [integer, fraction = ''] = value.split('.');
  if (fraction.length > precision && /[1-9]/.test(fraction.slice(precision))) throw new Error(`金额超过当前币种 ${precision} 位小数精度`);
  return BigInt(integer) * 10n ** BigInt(precision) + BigInt(fraction.slice(0, precision).padEnd(precision, '0') || '0');
}
function fromMinor(value, precision = moneyPrecision()) {
  if (!precision) return value.toString();
  const digits = value.toString().padStart(precision + 1, '0');
  return `${digits.slice(0, -precision)}.${digits.slice(-precision)}`;
}
function quantityValue() {
  const value = $('quantity').value.trim();
  if (!/^[1-9]\d*$/.test(value)) throw new Error('数量必须为正整数');
  return BigInt(value);
}
function synchronizeAmount(source) {
  for (const id of ['amount', 'unitPrice', 'quantity']) $(id).setCustomValidity('');
  if (!$('quantity').value.trim() || !$(source === 'amount' ? 'amount' : 'unitPrice').value.trim()) {
    setAuxStatus('amountHint', '填写数量和单价后联动总额；修改总额反算单价。'); return false;
  }
  try {
    const count = quantityValue();
    if (source === 'amount') {
      const total = toMinor($('amount').value);
      if (total % count) throw new Error(`总额无法按数量 ${count} 在当前币种精度内整除，请调整总额或数量`);
      $('unitPrice').value = fromMinor(total / count);
    } else $('amount').value = fromMinor(toMinor($('unitPrice').value) * count);
    setAuxStatus('amountHint', `总额 ${$('amount').value} = 单价 ${$('unitPrice').value} × ${count}；使用精确金额计算。`);
    return true;
  } catch (error) {
    $(source === 'quantity' ? 'quantity' : source).setCustomValidity(error.message);
    setAuxStatus('amountHint', error.message, 'error');
    return false;
  }
}
const fieldNames = { elementType:'Element SDK 组件', amount:'支付金额', currency:'币种', tradeCountry:'国家／地区', merchantTransactionId:'商户订单号', productName:'商品名称', productType:'商品类型', productImageUrl:'商品图片 URL', unitPrice:'商品单价', quantity:'数量', customerEmail:'买家邮箱', merchantUserId:'商户用户 ID', shopperIP:'买家公网 IP', captureDelayHours:'收款延迟', payResultUrl:'成功回跳 URL', payCancelUrl:'取消回跳 URL', notificationUrl:'异步通知 URL' };
for (const section of ['shipping', 'billing']) for (const [field, label] of Object.entries({country:'国家／地区', state:'州／省', city:'城市', street:'街道', postcode:'邮编'})) fieldNames[section + field[0].toUpperCase() + field.slice(1)] = `${section === 'shipping' ? '配送' : '账单'}${label}`;
function updateRequired() {
  const physical = $('productType').value === 'N';
  const required = new Set(['amount','currency','merchantTransactionId','productName','productType','unitPrice','quantity']);
  {
    for (const id of ['shopperIP','payResultUrl','payCancelUrl','captureDelayHours','productImageUrl']) required.add(id);
    if (physical || !$('merchantUserId').value.trim()) required.add('customerEmail');
    for (const section of ['shipping','billing']) if (physical || section === 'billing') for (const field of addressFields) required.add(section + field[0].toUpperCase() + field.slice(1));
    if (selectedMethods.size || ['elements','onepage'].includes(currentMode)) required.add('tradeCountry');
    if (currentMode === 'elements') required.add('elementType');
  }
  for (const id of Object.keys(fieldNames)) {
    const input = $(id); input.required = required.has(id); input.setAttribute('aria-required', String(input.required));
    const label = input.closest('label');
    if (label) label.classList.toggle('required-field', input.required);
  }
}
function showValidation(issues) {
  $('validationList').innerHTML = issues.map(({id, message}) => `<li><button type="button" class="text-btn" data-field="${escapeHtml(id)}">${escapeHtml(message)}</button></li>`).join('');
  if (!$('validationDialog').open) $('validationDialog').showModal();
}
function validateForm() {
  updateRequired();
  const issues = [];
  const invalid = [...$('checkoutForm').querySelectorAll('input,select')].filter(input => (input.required && !input.value.trim()) || !input.checkValidity());
  for (const input of invalid) {
    const details = input.closest('details'); if (details) details.open = true;
    const name = fieldNames[input.id] || '字段';
    issues.push({id:input.id, message:input.value.trim() ? `${name}：${input.validationMessage || '格式不正确'}` : `请填写／选择${name}`});
  }
  if (['amount','unitPrice','quantity'].every(id => $(id).value.trim())) try {
    const amount = toMinor($('amount').value), unit = toMinor($('unitPrice').value);
    if (amount <= 0n || unit <= 0n) throw new Error('支付金额与商品单价必须大于零');
    if (unit * quantityValue() !== amount) throw new Error('总额与商品单价、数量不一致，请调整金额');
  } catch (error) { issues.push({id:'amount', message:error.message}); }
  {
    for (const id of ['payResultUrl','payCancelUrl','notificationUrl','productImageUrl']) {
      const value = $(id).value.trim(); if (!value || invalid.includes($(id))) continue;
      try {
        const url = new URL(value);
        const localReturn = ['payResultUrl','payCancelUrl'].includes(id) && currentEnv === 'sandbox' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname) && url.protocol === 'http:';
        const schemeOK = id === 'productImageUrl' ? ['http:','https:'].includes(url.protocol) : url.protocol === 'https:' || localReturn;
        if (!schemeOK || url.username || url.password) throw new Error('请使用无用户名密码的 HTTPS 地址（沙箱回跳可用本机 HTTP）');
        if (id === 'productImageUrl' && value.length > 255) throw new Error('图片 URL 不能超过255字符');
        if (id === 'notificationUrl' && (url.search || url.hash || url.pathname === '/' || ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new Error('通知需公网 HTTPS 具体路径，且不含 query 或 hash');
      } catch (error) { issues.push({id, message:`${fieldNames[id]}：${error.message}`}); }
    }
    const ip = $('shopperIP').value.trim();
    if (ip) {
      let valid = false;
      if (ip.includes(':')) { try { const url = new URL(`http://[${ip}]/`); const normalized = url.hostname.replace(/^\[|\]$/g, ''); valid = !!normalized && !/^(::1$|::$|fc|fd|fe[89ab]|::ffff:)/i.test(normalized); } catch {} }
      else { const parts = ip.split('.'); valid = parts.length === 4 && parts.every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255) && !/^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) && Number(parts[0]) < 224; }
      if (!valid) issues.push({id:'shopperIP', message:'买家公网 IP：请填写有效公网 IP，不能使用回环或内网地址'});
    }
  }
  if (currentMode === 'elements') {
    const method = elementMethods[$('elementType').value];
    if (!method || !paymentRules.some(rule => rule.country === $('tradeCountry').value && rule.currency === $('currency').value && rule.method === method)) issues.push({id:'elementType', message:`Element SDK 组件 ${method || '未选择'} 没有明确支持的国家／币种路由，请在支付配置导入经官方或商户确认的组合`});
    else if (selectedMethods.size !== 1 || !selectedMethods.has(method)) issues.push({id:'elementType', message:'支付方式与所选 Element SDK 组件不一致，请重新选择组件'});
  }
  const problem = checkoutOptions.validateSelection(collectForm().bizContent, paymentRows);
  if (problem) issues.push({id:'tradeCountry', message:problem});
  if (!config?.credentials[currentEnv]?.configured) issues.push({id:'openMerchantConfig', message:config?.sessionMerchants ? '请导入当前环境的商户 Excel' : '当前环境商家配置不完整，请补充 accId、clientId、salt'});
  if (currentEnv === 'production' && (sandboxFixture || syntheticAddress || syntheticProfile)) issues.push({id:'clearProfileData', message:'请先清空沙箱资料，再填写生产资料。'});
  if (issues.length) { showValidation(issues); return false; }
  return true;
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function showError(error) {
  $('formError').textContent = error.message; $('formError').hidden = false;
  if ($('configDialog').open) $('configMessage').textContent = error.message;
  if (error.sessionId) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'text-btn'; button.textContent = '查看 SDK 初始化日志';
    button.onclick = () => showDetail({id:`session:${error.sessionId}`,sessionId:error.sessionId});
    $('formError').appendChild(button);
  }
}
function renderConfig() {
  const item = config?.credentials[currentEnv];
  renderMerchantOptions();
  const sessionOnly = config?.sessionMerchants === true;
  $('sessionImportNotice').hidden = !sessionOnly || item?.configured === true;
  $('sessionImport').disabled = busy;
  $('clearMerchants').disabled = busy || orderActionBusy || !config || !Object.values(config.merchants).some(rows => rows.length);
  $('applyProductionDefaults').hidden = currentEnv !== 'production';
  renderProfileSelectors();
  $('generateAddress').disabled = (currentEnv === 'production') || busy;
  $('configEnvironment').textContent = currentEnv === 'production' ? '生产环境' : '沙箱环境';
  $('envMenuToggle').disabled = busy;
  $('endpoint').textContent = item?.endpoint || '等待配置';
  $('accId').textContent = item?.accId ? '••••••••' : '未配置';
  $('clientId').textContent = item?.clientId ? '••••••••' : '未配置';
  for (const env of ['production', 'sandbox']) $(`${env}State`).textContent = config?.credentials[env]?.configured ? '已配置' : '未配置';
  document.querySelectorAll('.env-btn').forEach(btn => { btn.setAttribute('aria-pressed', String(btn.dataset.env === currentEnv)); btn.classList.toggle('active', btn.dataset.env === currentEnv); btn.disabled = busy; });
  $('checkoutMode').value = currentMode;
  $('checkoutMode').disabled = busy;
  $('elementsSettings').hidden = currentMode !== 'elements';
  $('onepageSettings').hidden = currentMode !== 'onepage';
  $('elementType').disabled = busy;
  $('envBadge').textContent = currentEnv === 'production' ? '生产环境' : '沙箱环境';
  $('envBadge').className = `badge ${currentEnv === 'production' ? 'prod' : 'sandbox'}`;
  $('submitLabel').textContent = busy ? '正在处理…' : '发起交易';
  $('submitBtn').setAttribute('aria-busy', String(busy));
  $('submitBtn').title = `${currentEnv === 'production' ? '生产' : '沙箱'}环境 · ${item?.configured ? '创建真实支付会话' : '未配置，禁止真实调用'}`;
  $('submitBtn').disabled = busy || (sessionOnly && !item?.configured);
  $('excelInput').disabled = busy;
  $('restoreMerchants').disabled = busy;
  $('refreshBtn').disabled = busy;
  document.querySelectorAll('#ordersBody [data-action]').forEach(button => { button.disabled = busy || orderActionBusy; });
}
function orderStatus(order) {
  const status = String(order.status || 'UNKNOWN').toUpperCase();
  if (order.simulated || status.startsWith('SIMULATED')) return { tone: 'pending', label: 'Sim', title: 'Simulated payment' };
  if (['SUCCESS', 'PAID'].includes(status)) return { tone: 'success', label: 'S', title: 'Success' };
  if (['FAILED', 'PAYMENT_FAILED', 'CANCEL', 'CLOSED', 'CANCELLED'].includes(status)) return { tone: 'failed', label: 'F', title: 'Failed' };
  return { tone: 'pending', label: 'P', title: `Pending — payment not confirmed (${status})` };
}
function orderRefund(order) {
  if (!order.refundAttempted && !order.refundStatus) return null;
  const status = String(order.refundStatus || 'UNKNOWN').toUpperCase();
  const precision = checkoutOptions.currencies[order.currency] ?? 6;
  let refunded = 0n, total = null;
  try {
    refunded = status === 'SUCCESS' ? toMinor(order.refundedAmount ?? order.refundAmount ?? '0', precision) : 0n;
    total = toMinor(order.amount, precision);
    if (refunded < 0n || refunded > total) refunded = 0n;
  } catch { refunded = 0n; }
  let label = 'Refund unknown', title = 'Refund not confirmed', tone = 'pending';
  if (status === 'PROCESSING') label = title = 'Refund processing';
  if (status === 'FAILED') { label = title = 'Refund failed'; tone = 'failed'; }
  if (status === 'SUCCESS' && refunded > 0n && total !== null && refunded <= total) {
    label = refunded === total ? 'R' : 'Partial'; title = refunded === total ? 'Fully refunded' : 'Partially refunded'; tone = 'success';
  }
  return { label, title, tone, amount: fromMinor(refunded, precision) };
}
let openQueryMenu = null;
function closeQueryMenu(restoreFocus = false) {
  if (!openQueryMenu) return;
  const { button, menu } = openQueryMenu;
  menu.hidden = true; button.setAttribute('aria-expanded', 'false');
  openQueryMenu = null;
  if (restoreFocus) button.focus();
}
function toggleQueryMenu(button, focusLast = false) {
  const menu = button.closest('.order-query').querySelector('[role="menu"]');
  const opening = menu.hidden;
  closeQueryMenu();
  if (!opening) return;
  menu.hidden = false; button.setAttribute('aria-expanded', 'true');
  openQueryMenu = { button, menu };
  const items = menu.querySelectorAll('[role="menuitem"]');
  items[focusLast ? items.length - 1 : 0].focus();
}
document.addEventListener('click', event => { if (!event.target.closest('.order-query')) closeQueryMenu(); });
document.addEventListener('focusin', event => { if (openQueryMenu && !event.target.closest('.order-query')) closeQueryMenu(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && openQueryMenu) { event.preventDefault(); closeQueryMenu(true); }
});
function renderOrders(next) {
  closeQueryMenu();
  orders = next;
  $('orderCount').textContent = orders.length;
  $('ordersBody').innerHTML = orders.length ? orders.map((order, index) => {
    const payment = orderStatus(order), refund = orderRefund(order);
    const disabled = busy || orderActionBusy ? 'disabled' : '';
    const orderId = escapeHtml(order.id);
    const actions = ['detail', 'queryMenu', 'refund', 'cancel', 'log', 'delete'].map(action => action === 'queryMenu'
      ? `<div class="order-query"><button type="button" data-order="${orderId}" data-action="queryMenu" aria-haspopup="menu" aria-expanded="false" aria-controls="order-query-${index}" ${disabled}>Query <span aria-hidden="true">▾</span></button><div id="order-query-${index}" class="order-query-menu" role="menu" aria-label="订单查询" hidden><button type="button" role="menuitem" tabindex="-1" data-order="${orderId}" data-action="query" ${disabled}>Sale Query</button><button type="button" role="menuitem" tabindex="-1" data-order="${orderId}" data-action="refundQuery" ${disabled}>Refund Query</button></div></div>`
      : `<button type="button" data-order="${orderId}" data-action="${action}" ${disabled}>${action[0].toUpperCase() + action.slice(1)}</button>`).join('');
    return `<article class="order-card"><div class="order-top"><span class="order-id">${escapeHtml(order.merchantTransactionId)}</span><span class="order-state"><span class="order-status ${payment.tone}" role="img" title="${escapeHtml(payment.title)}" aria-label="${escapeHtml(payment.title)}">${payment.label}</span>${refund ? ` <span class="order-refund ${refund.tone}" role="img" title="${refund.title}" aria-label="${refund.title}">(${refund.label})</span>` : ''}</span><strong class="order-amount">${escapeHtml(order.amount)} ${escapeHtml(order.currency || '币种未传')}${refund ? ` <span class="order-refunded">(R ${refund.amount})</span>` : ''}</strong></div><div class="order-meta"><span>${order.env === 'production' ? '生产' : '沙箱'}</span><span>${order.mode === 'onepage' ? 'OnePage Checkout' : order.mode === 'elements' ? 'Element SDK' : order.mode === 'embedded' ? '嵌入式收银台' : '跳转收银台'}</span><time>${escapeHtml(new Date(order.createdAt).toLocaleString('zh-CN', { hour12: false }))}</time></div><div class="order-actions">${actions}</div></article>`;
  }).join('') : '<p class="empty">暂无请求记录</p>';
}
function safeSummary(value) {
  if (!value || typeof value !== 'object') return {};
  const allowed = ['id', 'orderId', 'merchantTransactionId', 'transactionId', 'env', 'amount', 'currency', 'mode', 'status', 'createdAt', 'updatedAt', 'simulated', 'code', 'signatureVerified', 'captureDelayHours'];
  const result = {};
  for (const key of allowed) if (['string', 'number', 'boolean'].includes(typeof value[key])) result[key] = value[key];
  for (const key of ['requestSummary', 'responseSummary', '_meta', 'bizContent']) if (value[key] && typeof value[key] === 'object') result[key] = safeSummary(value[key]);
  return result;
}
function openOrderDetail(id) {
  const order = orders.find(item => item.id === id); if (!order) return;
  selectedOrderId = order.id;
  $('orderDetailText').textContent = JSON.stringify(order, null, 2);
  if (!$('orderDetailDialog').open) $('orderDetailDialog').showModal();
}
$('closeOrderDetail').onclick = () => $('orderDetailDialog').close();
async function deleteOrder(id) {
  const order = orders.find(item => item.id === id); if (!order || busy || orderActionBusy || pendingAction) return;
  orderActionBusy = true; renderOrders(orders);
  try {
    await post('/api/orders/delete', {id:order.id,confirmed:true});
    if (selectedOrderId === order.id) {
      selectedOrderId = null; $('detailDialog').close(); $('orderDetailDialog').close();
      $('detailText').textContent = ''; $('orderDetailText').textContent = '';
    }
    if (pendingAction?.order.id === order.id) { pendingAction = null; $('orderActionDialog').close(); }
    renderOrders(orders.filter(item => item.id !== order.id));
    await refreshOrders();
  } catch (error) { showError(error); }
  finally { orderActionBusy = false; renderOrders(orders); }
}
async function showDetail(order) {
  selectedOrderId = order.id;
  $('detailText').textContent = '正在读取订单日志…';
  $('logSummary').textContent = '';
  $('detailError').textContent = '';
  if (!$('detailDialog').open) $('detailDialog').showModal();
  try {
    const result = await api(order.sessionId ? `/api/elements/logs?sessionId=${encodeURIComponent(order.sessionId)}` : `/api/orders/logs?id=${encodeURIComponent(order.id)}`);
    if (selectedOrderId === order.id) {
      $('detailText').textContent = JSON.stringify(result.logs, null, 2);
      $('logSummary').textContent = result.logs.length ? result.logs.map((log, index) => {
        const recorded = key => key === 'responseTime' && log[key] === null ? '未收到返回' : typeof log[key] === 'string' && log[key] ? log[key] : '未记录';
        return `#${index + 1} · ${recorded('action')}\n请求时间 requestTime：${recorded('requestTime')}\n响应时间 responseTime：${log.responseTime === null && log.responseHeadersTime ? '已收到响应头，正文未完整返回' : recorded('responseTime')}\n方法 method：${recorded('method')}\n接口 endpoint：${recorded('endpoint')}${log.error ? `\n失败原因：${log.error}` : ''}${log.errorStage ? `\n失败阶段：${log.errorStage}` : ''}${Number.isFinite(log.durationMs) ? `\n耗时：${log.durationMs} ms` : ''}`;
      }).join('\n\n') : '暂无日志';
      $('detailError').textContent = result.notice || '';
    }
  } catch (error) { $('detailError').textContent = error.message; }
}
function safePingPongUrl(raw) {
  if (typeof raw !== 'string') throw new Error('支付服务未返回有效地址');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !(url.hostname === 'pingpongx.com' || url.hostname.endsWith('.pingpongx.com'))) throw new Error('已阻止不受信任的支付地址，仅允许 HTTPS PingPong 域名');
  return url.href;
}
let activeCheckout = null;
const elementMethods = {applePayButton:'ApplePay',googlePayButton:'GooglePay',paypalButton:'PayPal'};
const elementTypes = Object.keys(elementMethods);
function clearCheckoutSession() {
  sessionGeneration++;
  if (activeCheckout) activeCheckout.destroy();
  activeCheckout = null;
  $('resultPanel').hidden = true;
  $('resultContent').replaceChildren();
}
function showCheckoutProgress(message) {
  $('resultPanel').hidden = false;
  $('resultStatus').className = 'status-pill pending';
  $('resultStatus').textContent = message;
  $('resultContent').innerHTML = '<p id="checkoutResultHint">正在连接支付服务，请稍候。未确认付款，请勿重复提交。</p>';
  $('resultPanel').scrollIntoView({behavior:'instant', block:'nearest'});
}
function checkoutFailure(error) {
  $('resultPanel').hidden = false;
  $('resultStatus').className = 'status-pill fail';
  $('resultStatus').textContent = '支付组件未就绪／操作异常';
  const hint = $('checkoutResultHint');
  if (hint) hint.textContent = `${error.message}。请检查网络、环境配置或会话日志；若已创建订单，请先查询状态，勿重复付款。`;
  showError(error);
  $('resultPanel').scrollIntoView({behavior:'smooth', block:'nearest'});
}
function mountSdkFrame(payload, request, generation) {
  if (generation !== sessionGeneration) return Promise.resolve();
  const frame = document.createElement('iframe');
  frame.className = 'sdk-checkout-frame'; frame.title = `${request.mode === 'onepage' ? 'OnePage' : request.mode === 'elements' ? 'Element SDK' : '内嵌收银台'}支付组件`;
  frame.src = './sdk-host.html?v=2.2.0'; frame.referrerPolicy = 'no-referrer';
  frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox');
  frame.setAttribute('allow', 'payment *');
  const channel = crypto.randomUUID();
  let port;
  let destroyed = false, initialized = false, settled = false, orderPromise = null, orderPayMethod = null;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const current = () => !destroyed && generation === sessionGeneration;
  const send = (type, values = {}) => { if (current()) port?.postMessage({type,channel,generation,...values}); };
  const settle = error => {
    if (settled) return;
    settled = true; clearTimeout(watchdog);
    if (error) rejectReady(error); else resolveReady();
  };
  const watchdog = setTimeout(() => {
    if (!current()) return;
    const error = new Error('支付 SDK 就绪超时（30 秒），可能是脚本、网络或商户初始化异常');
    if (payload.session?.sessionId) error.sessionId = payload.session.sessionId;
    settle(error); active.destroy();
  }, 30000);
  const requestOrder = payMethod => {
    if (!current()) return Promise.reject(new Error('支付会话已失效，请重新发起交易'));
    if (typeof payMethod !== 'string' || !payMethod.trim()) return Promise.reject(new Error('SDK 未返回有效支付方式'));
    if (request.mode === 'elements' && payMethod !== elementMethods[request.elementType]) return Promise.reject(new Error(`本次组件不支持支付方式 ${payMethod}`));
    if (request.mode === 'onepage' && !payload.session.allowedMethods.includes(payMethod)) return Promise.reject(new Error('支付方式不在本次冻结的候选列表中'));
    if (orderPayMethod && orderPayMethod !== payMethod) return Promise.reject(new Error('本次会话已绑定其他支付方式，请查询订单后重新发起交易'));
    orderPayMethod = payMethod;
    if (!orderPromise) orderPromise = (async () => {
      const data = await post(`/api/${request.mode}/order`, {sessionId:payload.session.sessionId,payMethod, ...(request.productionTestMode ? {productionTestMode:true} : {})});
      if (!current()) throw new Error('支付会话已失效，未使用返回的订单 token');
      if (data.code !== '000000' || typeof data.bizContent?.token !== 'string' || !data.bizContent.token.trim()) throw new Error('预下单失败或未返回有效订单 token；请查询订单状态后重新发起交易');
      $('resultStatus').textContent = '订单已创建，未确认付款';
      refreshOrders().catch(error => { if (current()) showError(error); });
      return data.bizContent.token;
    })();
    return orderPromise;
  };
  const receive = async event => {
    const message = event.data;
    if (!current() || !message || message.channel !== channel || message.generation !== generation) return;
    if (!['ready','error','result','requestOrder','resize'].includes(message.type)) return;
    if (message.type === 'ready') {
      $('resultStatus').textContent = '支付组件已就绪，未确认付款';
      $('checkoutResultHint').textContent = '本次订单资料已冻结；修改表单需重新发起交易。仅用户操作支付组件才继续付款，客户端提示不代表最终付款结果。';
      settle();
    } else if (message.type === 'error') {
      const error = new Error(typeof message.message === 'string' ? message.message.slice(0, 500) : '支付 SDK 初始化异常');
      if (payload.session?.sessionId) error.sessionId = payload.session.sessionId;
      checkoutFailure(error);
      if (!settled) { settle(error); active.destroy(); }
    } else if (message.type === 'result') {
      const labels = {success:'组件报告成功，待服务端确认',pending:'支付组件处理中',failed:'支付组件报告失败',cancel:'用户取消组件操作'};
      $('resultStatus').textContent = labels[message.status] || '支付组件已返回结果';
      $('checkoutResultHint').textContent = '此结果仅为客户端提示，最终支付状态以可信通知或服务端查询为准。';
    } else if (message.type === 'resize') {
      if (Number.isFinite(message.height)) frame.style.height = `${Math.max(160, Math.min(2400, message.height))}px`;
    } else if (message.type === 'requestOrder' && ['elements','onepage'].includes(request.mode) && typeof message.requestId === 'string' && message.requestId.length <= 80) {
      try { const token = await requestOrder(message.payMethod); send('orderResult', {requestId:message.requestId,token}); }
      catch (error) { if (current()) { checkoutFailure(error); send('orderResult', {requestId:message.requestId,error:error.message}); } }
    }
  };
  const active = {frame, generation, destroy() {
    if (destroyed) return;
    destroyed = true; clearTimeout(watchdog); window.removeEventListener('message', connect); port?.close();
    frame.remove(); settle();
  }};
  activeCheckout = active;
  function connect(event) {
    if (!current() || initialized || event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.type !== 'checkout-frame-ready' || event.ports.length !== 1) return;
    initialized = true;
    port = event.ports[0];
    port.onmessage = receive;
    const {mode,env,elementType,bizContent} = request;
    const {amount,currency,tradeCountry,language,payResultUrl,goods} = bizContent;
    send('init', {payload:{...payload,request:{mode,env,elementType,bizContent:{amount,currency,tradeCountry,language,payResultUrl,goods}}}});
  }
  window.addEventListener('message', connect);
  $('resultContent').appendChild(frame);
  const boundary = document.createElement('p'); boundary.className = 'config-help';
  boundary.textContent = '组件在隔离框架内运行，钱包可能打开授权弹窗或在组件内跳转；本工具不主动跳转父页面。浏览器、钱包域名验证或渠道安全策略可能限制 iframe，请在系统浏览器核实。已冻结订单金额及资料，修改后必须重新发起交易。';
  $('resultContent').appendChild(boundary);
  return ready;
}
async function mountElements(session, request, generation) {
  const expectedUrl = `https://acquirer-cdn.pingpongx.com/acquirer/components/sdk/${request.env}/v1/index.js`;
  validateSdkSession(session, request, expectedUrl);
  if (!elementTypes.includes(request.elementType)) throw new Error('请选择支持的 Element SDK 组件');
  return mountSdkFrame({session,sdkUrl:expectedUrl}, request, generation);
}
function validateSdkSession(session, request, expectedUrl) {
  if (!['sandbox','production'].includes(request.env) || session.sdkUrl !== expectedUrl || session.env !== request.env || session.region !== 'fra') throw new Error('SDK 环境或脚本地址与本次会话不一致');
  if (![session.sessionId,session.sdkAccessToken,session.accId].every(value => typeof value === 'string' && value.trim())) throw new Error('SDK 会话凭证不完整');
}
async function mountOnePage(session, request, generation) {
  const expectedUrl = `https://payssr-cdn.pingpongx.com/production-fra/acquirer-checkout-onepage/${request.env === 'sandbox' ? 'sandbox/' : ''}pp-checkout.js`;
  validateSdkSession(session, request, expectedUrl);
  if (!Array.isArray(session.allowedMethods) || !session.allowedMethods.length || session.allowedMethods.some(method => typeof method !== 'string' || !method.trim())) throw new Error('OnePage 未返回有效的冻结支付方式列表');
  return mountSdkFrame({session,sdkUrl:expectedUrl}, request, generation);
}
async function mountEmbedded(biz, locale, generation, env = currentEnv) {
  const sdkUrl = safePingPongUrl(biz.innerJsUrl), parsed = new URL(sdkUrl);
  const expectedPath = `/production-fra/acquirer-checkout-web/${env === 'sandbox' ? 'sandbox/' : ''}pp-checkout.js`;
  if (!['sandbox','production'].includes(env) || parsed.origin !== 'https://payssr-cdn.pingpongx.com' || parsed.pathname !== expectedPath) throw new Error('内嵌 SDK 脚本路径或环境不匹配');
  if (typeof biz.token !== 'string' || !biz.token.trim()) throw new Error('未返回有效支付会话 token');
  return mountSdkFrame({sdkUrl,token:biz.token}, {mode:'embedded',env,bizContent:{language:locale}}, generation);
}
async function showResult(data, request, generation) {
  $('resultPanel').hidden = false;
  $('resultStatus').className = `status-pill ${data.simulated || data.code === '000000' ? 'pending' : 'fail'}`;
  $('resultStatus').textContent = data.code === '000000' ? '会话已创建，未确认付款' : '支付接口返回失败';
  $('resultContent').innerHTML = '<p id="checkoutResultHint">最终支付状态以可信通知或服务端查询为准，创建会话不代表付款成功。</p>';
  const summary = document.createElement('pre');
  summary.className = 'result-json';
  summary.textContent = JSON.stringify(safeSummary(data), null, 2);
  $('resultContent').appendChild(summary);
  if (data.code === '000000') {
    if (request.mode === 'embedded') await mountEmbedded(data.bizContent || {}, request.bizContent.language, generation, request.env);
    else if (request.mode === 'redirect') {
      const paymentUrl = safePingPongUrl(data.bizContent?.paymentUrl);
      const openButton = document.createElement('button');
      openButton.className = 'secondary-btn';
      openButton.textContent = '在新窗口打开 PingPong 收银台';
      openButton.onclick = () => window.open(paymentUrl, '_blank', 'noopener,noreferrer');
      $('resultContent').appendChild(openButton);
      if (config?.sessionMerchants && window.top === window) { window.location.assign(paymentUrl); return; }
      window.open(paymentUrl, '_blank', 'noopener,noreferrer');
      $('checkoutResultHint').textContent = '已尝试在新窗口打开收银台；若被浏览器拦截，请点击下方按钮。最终支付状态以可信通知或服务端查询为准。';
    }
  }
  $('resultPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function collectForm() {
  const value = id => $(id).value.trim();
  const goods = {};
  for (const [key, id] of Object.entries({name:'productName', unitPrice:'unitPrice', number:'quantity', virtualProduct:'productType', imgUrl:'productImageUrl', description:'productDescription'})) if (value(id)) goods[key] = value(id);
  const bizContent = { goods:[goods] };
  for (const key of ['amount','merchantTransactionId']) if (value(key)) bizContent[key] = value(key);
  if (value('captureDelayHours')) bizContent.captureDelayHours = Number(value('captureDelayHours'));
  for (const key of ['currency', 'tradeCountry', 'payResultUrl', 'payCancelUrl', 'language', 'shopperIP', 'merchantUserId', 'notificationUrl']) if (value(key)) bizContent[key] = value(key);
  if (value('customerEmail')) bizContent.customer = { email: value('customerEmail') };
  if (value('paymentMethods')) bizContent.paymentMethods = value('paymentMethods').split(',').map(item => item.trim()).filter(Boolean);
  for (const section of ['shipping', 'billing']) {
    const address = Object.fromEntries(addressFields.map(field => [field, value(section + field[0].toUpperCase() + field.slice(1))]).filter(([, text]) => text));
    if (Object.keys(address).length) bizContent[`${section}Address`] = address;
  }
  return { env: currentEnv, merchantId: selectedMerchantId(), mode: currentMode, bizContent, ...(currentMode === 'elements' ? {elementType: value('elementType')} : {}), ...(syntheticAddress ? {syntheticAddress:true} : {}), ...(syntheticProfile || sandboxFixture ? {syntheticProfile:true} : {}) };
}
async function refreshOrders() { renderOrders((await api('/api/orders')).orders); }
async function refreshPaymentConfig() {
  const result = await api('/api/payment-config');
  paymentRows = result.rows;
  rebuildRules(); renderRouting();
  for (const method of selectedMethods) if (!paymentRules.some(rule => rule.country === $('tradeCountry').value && rule.currency === $('currency').value && rule.method === method)) selectedMethods.delete(method);
  renderMethodOptions();
  renderProfileSelectors();
  $('paymentConfigRows').textContent = JSON.stringify({ version: result.version, rows: paymentRows }, null, 2);
}
async function refresh() {
  const revision = ++configRevision;
  if (activeCheckout || !$('resultPanel').hidden) clearCheckoutSession();
  const result = await api('/api/config');
  if (revision !== configRevision) return;
  config = result; setEnvironment(config.env); renderConfig();
  await Promise.all([refreshOrders(), refreshPaymentConfig(), refreshProfiles()]);
  if (revision !== configRevision) return;
  renderProfileSelectors(); if (currentEnv === 'production') applyProductionDefaults();
}
async function submit() {
  if (busy) return;
  $('formError').hidden = true;
  if (!validateForm()) return;
  if (!config?.credentials[currentEnv]?.configured) return showError(new Error('当前环境商家配置尚未完成，请先完成商家配置后发起交易'));
  if (!orderNumberEdited) newOrderNo();
  const request = collectForm();
  request.bizContent.amount = fromMinor(toMinor(request.bizContent.amount));
  request.bizContent.goods[0].unitPrice = fromMinor(toMinor(request.bizContent.goods[0].unitPrice));
  const merchantLabel = $('transactionMerchant').selectedOptions[0]?.textContent || '';
  const environmentLabel = currentEnv === 'production' ? '生产环境 · 可能产生真实扣款' : '沙箱环境';
  if (!await confirmLocalAction(`确认发起交易？\n${environmentLabel}\n交易商户：${merchantLabel}\n商户订单号：${request.bizContent.merchantTransactionId}\n金额：${request.bizContent.amount} ${request.bizContent.currency}`)) return;
  request.productionConfirmed = currentEnv === 'production';
  busy = true;
  renderConfig();
  clearCheckoutSession();
  const generation = sessionGeneration;
  showCheckoutProgress('正在创建支付会话…');
  try {
    const data = await post(['elements','onepage'].includes(request.mode) ? `/api/${request.mode}/session` : '/api/prepay', request);
    if (generation !== sessionGeneration) return;
    if (['elements','onepage'].includes(request.mode)) {
      $('resultStatus').textContent = '会话已创建，正在加载支付组件…';
      if (request.mode === 'elements') await mountElements(data, request, generation);
      else await mountOnePage(data, request, generation);
    } else await showResult(data, request, generation);
  }
  catch (error) { if (generation === sessionGeneration) checkoutFailure(error); }
  finally { newOrderNo(); busy = false; renderConfig(); await refreshOrders().catch(showError); }
}
$('newOrderBtn').onclick = newOrderNo;
$('merchantTransactionId').oninput = () => { orderNumberEdited = true; };
$('amount').oninput = () => { amountEdited = !!$('amount').value.trim(); $('productPreset').value = ''; synchronizeAmount('amount'); };
$('unitPrice').oninput = () => { amountEdited = false; synchronizeAmount('unitPrice'); };
$('quantity').oninput = () => { const source = amountEdited && !$('unitPrice').value ? 'amount' : 'quantity'; synchronizeAmount(source); };
for (const [id, step] of [['quantityMinus', -1n], ['quantityPlus', 1n]]) $(id).onclick = () => {
  try { const next = ($('quantity').value.trim() ? quantityValue() : 0n) + step; $('quantity').value = String(next < 1n ? 1n : next); $('productPreset').value = ''; $('quantity').oninput(); }
  catch (error) { showError(error); }
};
$('refreshBtn').onclick = async () => {
  if (busy) return;
  busy = true; renderConfig();
  try { await refresh(); }
  catch (error) { showError(error); }
  finally { busy = false; renderConfig(); }
};
$('reloadOrders').onclick = () => refreshOrders().catch(showError);
$('checkoutForm').onsubmit = event => { event.preventDefault(); submit(); };
document.querySelectorAll('.env-btn').forEach(btn => btn.onclick = async () => {
  if (busy) return;
  closeEnvMenu();
  busy = true; renderConfig();
  clearCheckoutSession();
  try {
    configRevision++;
    config = await post('/api/env', { env: btn.dataset.env }); setEnvironment(config.env);
    if (currentEnv === 'production') applyProductionDefaults();
    else if ($('tradeCountry').value) { selectCountryDefaults(); applyMatchingProfiles(); }
    renderConfig();
  }
  catch (error) { showError(error); }
  finally { busy = false; renderConfig(); }
});
$('checkoutMode').onchange = () => {
  if (busy || !['redirect', 'embedded', 'elements', 'onepage'].includes($('checkoutMode').value)) { $('checkoutMode').value = currentMode; return; }
  currentMode = $('checkoutMode').value;
  clearCheckoutSession(); renderMethodOptions(); applyMatchingProfiles(); renderConfig(); updateRequired();
};
$('elementType').onchange = () => { clearCheckoutSession(); renderMethodOptions(); applyMatchingProfiles(); updateRequired(); };
function copyShipping() {
  for (const field of addressFields) { const suffix = field[0].toUpperCase() + field.slice(1); $(`billing${suffix}`).value = $(`shipping${suffix}`).value; }
}
function syncBilling() {
  if ($('sameBilling').checked) copyShipping();
  for (const field of addressFields) $('billing' + field[0].toUpperCase() + field.slice(1)).readOnly = $('sameBilling').checked;
}
async function fetchPublicIP(replace = false) {
  const revision = ipRevision, request = ++ipRequest, initial = $('shopperIP').value;
  setAuxStatus('ipStatus', '正在获取本机网络出口公网 IPv4…', 'progress');
  let data;
  try {
    data = await api(`/api/public-ip${replace ? '?refresh=1' : ''}`);
    if (typeof data.ip !== 'string' || !data.ip.trim()) throw new Error('未返回有效 IP');
  } catch {
    data = { ip: '', fallback: true };
  }
  if (request !== ipRequest) return;
  if (revision !== ipRevision || $('shopperIP').value !== initial || (!replace && initial.trim())) { setAuxStatus('ipStatus', '已保留手工填写的 IP。'); return; }
  if (data.ip) $('shopperIP').value = data.ip;
  setAuxStatus('ipStatus', data.fallback
    ? '未能取得公网 IP，请核对或手工填写。'
    : '已填入本机网络出口 IPv4，可手工修改；代理／VPN 可能影响出口。', data.fallback ? 'error' : 'info');
}
async function generateTestAddress() {
  const country = $('tradeCountry').value, revision = addressRevision, request = ++addressRequest;
  if (!country) { setAuxStatus('addressStatus', '请先选择国家／地区；已有地址未改动。', 'error'); return; }
  setAuxStatus('addressStatus', '正在生成测试示例地址…', 'progress');
  try {
    const data = await api(`/api/test-address?country=${encodeURIComponent(country)}`);
    if (request !== addressRequest || country !== $('tradeCountry').value) {
      if (request === addressRequest) setAuxStatus('addressStatus', '国家已切换，未应用生成结果。');
      return;
    }
    if (revision !== addressRevision) { setAuxStatus('addressStatus', '生成期间地址已手工修改，保留手工内容。'); return; }
    for (const field of addressFields) $('shipping' + field[0].toUpperCase() + field.slice(1)).value = data.address[field] || '';
    syntheticAddress = true; addressRevision++; syncBilling();
    $('shippingPreset').value = ''; if ($('sameBilling').checked) $('billingPreset').value = ''; renderProfileSafety();
    setAuxStatus('addressStatus', data.notice || '随机测试示例，仅限沙箱，非真实可投递地址。');
  } catch (error) { if (request === addressRequest) setAuxStatus('addressStatus', '测试地址生成失败；已有地址保留，请手工填写或重试。', 'error'); }
}
$('copyAddress').onclick = () => { copyShipping(); syncBilling(); $('billingPreset').value = ''; };
$('sameBilling').onchange = () => { syncBilling(); $('billingPreset').value = ''; };
$('generateAddress').onclick = generateTestAddress;
$('clearAddresses').onclick = () => {
  addressRevision++; addressRequest++;
  for (const section of ['shipping','billing']) for (const field of addressFields) $(section + field[0].toUpperCase() + field.slice(1)).value = '';
  syntheticAddress = false;
  if (sandboxFixture) { for (const id of ['customerEmail','merchantUserId','productName','productImageUrl']) $(id).value = ''; sandboxFixture = false; }
  $('shippingPreset').value = ''; $('billingPreset').value = '';
  syncBilling(); updateRequired(); renderProfileSafety(); setAuxStatus('addressStatus', syntheticProfile ? '地址已清空，但其他预设测试资料标记仍保留；需要生产调用请使用“清空测试资料”。' : '测试地址已清空。请填写真实地址；配送输入将同步到账单。');
};
for (const section of ['shipping','billing']) for (const field of addressFields) $(section + field[0].toUpperCase() + field.slice(1)).oninput = () => { addressRevision++; $(profileSections[section].select).value = ''; if (section === 'shipping') { syncBilling(); if ($('sameBilling').checked) $('billingPreset').value = ''; } };
$('shopperIP').oninput = () => { ipRevision++; setAuxStatus('ipStatus', '使用手工填写的 IP。'); };
$('refreshIP').onclick = () => fetchPublicIP(true);
for (const id of ['productType','customerEmail','merchantUserId']) $(id).addEventListener('input', () => updateRequired());
$('closeValidation').onclick = () => { $('validationDialog').close(); updateRequired(); };
$('validationList').onclick = event => {
  const button = event.target.closest('[data-field]'); if (!button) return;
  $('validationDialog').close(); updateRequired();
  if (button.dataset.field === 'openMerchantConfig') { openConfigDialog(); return; }
  const field = $(button.dataset.field);
  const details = field.closest('details'); if (details) details.open = true;
  field.focus(); field.scrollIntoView({behavior:'smooth', block:'center'});
};
$('downloadTemplate').onclick = () => downloadFile('/api/template.xlsx', 'configMessage');
$('clearMerchants').onclick = async () => {
  if (busy || orderActionBusy || !await confirmLocalAction('清空本页两个环境的全部商户和密钥？再次交易需重新导入。')) return;
  clearCheckoutSession();
  config = await post('/api/config/clear', {});
  renderConfig();
  $('configMessage').textContent = '本页商户及密钥已清空。';
};
$('downloadPaymentTemplate').onclick = () => downloadFile('/api/payment-config/template', 'paymentConfigMessage');
$('excelInput').onchange = async event => {
  const files = Array.from(event.target.files);
  if (!files.length || busy) return;
  const restore = $('restoreMerchants').checked;
  if (restore && !await confirmLocalAction('按当前备份的规则恢复？标为 replace 的环境将只保留备份中的商户。')) { event.target.value = ''; return; }
  clearCheckoutSession();
  busy = true; renderConfig();
  try {
    if (files.some(file => !/\.xlsx$/i.test(file.name))) throw new Error('仅支持 .xlsx 文件，不支持旧版 .xls');
    if (files.some(file => file.size > 1024 * 1024)) throw new Error('每个 Excel 文件上限为 1 MB');
    if (files.reduce((sum,file) => sum + file.size,0) > 8 * 1024 * 1024) throw new Error('所选 Excel 文件合计超过 8 MB，请分批导入');
    const workbooks = await Promise.all(files.map(readExcel));
    configRevision++;
    const result = await post('/api/import', {files:workbooks,strategy:restore ? 'file' : 'merge'});
    config = result;
    setEnvironment(config.env);
    renderConfig();
    if (result.order) {
      addressRevision++; addressRequest++;
      $('tradeCountry').value = result.order.tradeCountry || '';
      renderRouting();
      $('currency').value = result.order.currency || '';
      selectCountryDefaults();
      if (result.order.currency) $('currency').value = result.order.currency;
      selectedMethods.clear();
      for (const method of (result.order.paymentMethods || '').split(',').map(item => item.trim()).filter(Boolean)) selectedMethods.add(method);
      showSelectedMethods();
      renderMethodOptions();
      applyMatchingProfiles();
      for (const id of [...textFields, ...['shipping', 'billing'].flatMap(section => addressFields.map(field => section + field[0].toUpperCase() + field.slice(1)))]) if (result.order[id] !== undefined) $(id).value = result.order[id];
      if (result.order.billingCountry) {
        $('sameBilling').checked = addressFields.every(field => {
          const suffix = field[0].toUpperCase() + field.slice(1);
          return result.order['billing'+suffix] === result.order['shipping'+suffix];
        });
      }
      if (result.order.shopperIP !== undefined) ipRevision++;
      if (result.order.merchantTransactionId) orderNumberEdited = true;
      if (result.order.number !== undefined) $('quantity').value = result.order.number;
      showSelectedMethods(); renderMethodOptions();
      $('captureDelayHours').value = result.order.captureDelayHours ?? '';
      syncBilling(); updateRequired();
    }
    $('formError').hidden = true;
    {
      const counts = ['production','sandbox'].map(env => `${env === 'production' ? '生产' : '沙箱'} ${result.merchants?.[env]?.length || 0} 个商户`).join('、');
      const duplicates = result.importSummary?.duplicateRows?.length || 0;
      $('configMessage').textContent = `已导入 ${files.length} 个文件${counts ? `：${counts}` : ''}${duplicates ? `；已合并 ${duplicates} 行完全相同的重复配置` : ''}。可在支付会话的“交易商户”选择当前环境的商户${result.order ? '；订单参数已填入，请核对后再发起交易' : ''}。`;
    }
  } catch (error) { showError(error); }
  finally { event.target.value = ''; busy = false; renderConfig(); }
};
async function executeOrderAction(order, action, amount) {
  if (orderActionBusy) return;
  orderActionBusy = true; renderOrders(orders); $('confirmOrderAction').disabled = true; $('closeOrderAction').disabled = true;
  try {
    const body = { id: order.id, action, confirmed: true };
    if (amount !== undefined) body.amount = amount;
    if (order.env === 'production' && !['query', 'refundQuery'].includes(action)) body.productionConfirmed = true;
    await post('/api/orders/action', body);
    $('orderActionDialog').close();
    pendingAction = null;
    await refreshOrders();
  } catch (error) {
    if ($('orderActionDialog').open) $('orderActionError').textContent = error.message; else showError(error);
    await refreshOrders().catch(showError);
  } finally { orderActionBusy = false; $('confirmOrderAction').disabled = false; $('closeOrderAction').disabled = false; renderOrders(orders); }
}
$('ordersBody').onclick = event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled || busy || orderActionBusy) return;
  const order = orders.find(item => item.id === button.dataset.order), action = button.dataset.action;
  if (!order) return;
  if (action === 'queryMenu') return toggleQueryMenu(button);
  closeQueryMenu();
  if (action === 'detail') return openOrderDetail(order.id);
  if (action === 'delete') return deleteOrder(order.id);
  if (action === 'log') return showDetail(order);
  if (['query', 'refundQuery'].includes(action)) return executeOrderAction(order, action);
  if (!['refund', 'cancel'].includes(action)) return;
  pendingAction = { order, action };
  $('orderActionTitle').textContent = `确认 ${action[0].toUpperCase() + action.slice(1)}`;
  $('orderActionSummary').textContent = `订单：${order.merchantTransactionId}\n环境：${order.env === 'production' ? '生产环境（真实交易）' : '沙箱环境'}${order.simulated ? ' · 本地模拟' : ''}\n订单金额：${order.amount} ${order.currency || '币种未传'}\n网关查询结果决定能否执行此操作。\n${action === 'refund' ? '当前每单仅允许一次退款尝试（包括部分退款）；未知或处理中不能再次退款。查询成功不等于退款成功。\n' : ''}处理中或结果未知的订单禁止再次变更，请使用对应的 Sale Query 或 Refund Query 确认结果；旧历史未绑定商户时，由服务端校验可用商户后决定是否支持操作。`;
  $('refundAmountField').hidden = action !== 'refund'; $('refundAmount').required = action === 'refund'; $('refundAmount').value = order.amount;
  $('orderActionError').textContent = ''; $('orderActionDialog').showModal();
};
$('ordersBody').onkeydown = event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled || busy || orderActionBusy) return;
  if (button.dataset.action === 'queryMenu' && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    if (!openQueryMenu || openQueryMenu.button !== button) toggleQueryMenu(button, event.key === 'ArrowUp');
    else openQueryMenu.menu.querySelectorAll('[role="menuitem"]')[event.key === 'ArrowUp' ? 1 : 0].focus();
    return;
  }
  if (!openQueryMenu || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const items = [...openQueryMenu.menu.querySelectorAll('[role="menuitem"]')];
  const index = items.indexOf(button);
  if (index < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[next].focus();
};
$('closeOrderAction').onclick = () => { if (!orderActionBusy) { pendingAction = null; $('orderActionDialog').close(); } };
$('orderActionDialog').addEventListener('cancel', event => { if (orderActionBusy) event.preventDefault(); });
$('orderActionForm').onsubmit = event => {
  event.preventDefault();
  if (!pendingAction || orderActionBusy) return;
  const { order, action } = pendingAction;
  let amount;
  if (action === 'refund') {
    amount = $('refundAmount').value.trim();
    try {
      const precision = checkoutOptions.currencies[order.currency] ?? 6;
      const refund = toMinor(amount, precision);
      if (refund <= 0n || refund > toMinor(order.amount, precision)) throw new Error('退款金额必须大于零且不能超过订单金额');
      amount = fromMinor(refund, precision);
    } catch (error) { $('orderActionError').textContent = error.message; return; }
  }
  executeOrderAction(order, action, amount);
};
function previewPaymentRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('配置必须包含非空 rows 数组');
  if (rows.some(row => !row || typeof row !== 'object' || Array.isArray(row) || ['country', 'method', 'currency'].some(key => typeof row[key] !== 'string'))) throw new Error('每行需要 country、method、currency 三个文本字段');
  paymentPreview = rows.map(({ country, method, currency }) => ({ country, method, currency }));
  const compiled = checkoutOptions.compileRows(paymentPreview);
  $('paymentConfigMessage').textContent = `待确认：${rows.length} 条原始行，${compiled.rules.length} 个可调用组合，${compiled.duplicates} 个重复组合，${compiled.issues.length} 个问题。原始行保留；仅明确国家组合启用，XB 等未知标记不启用，复合方法不拆分。`;
  $('paymentConfigPreview').textContent = JSON.stringify({ issues: compiled.issues, rows: paymentPreview }, null, 2);
  $('savePaymentConfig').disabled = false;
}
function parsePaymentTsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) throw new Error('请粘贴三列 TSV 内容');
  const first = lines[0].split('\t').map(value => value.trim());
  if (/^(国家|country)/i.test(first[0]) && /method|方式/i.test(first[1] || '')) lines.shift();
  return lines.map((line, index) => {
    const columns = line.split('\t');
    if (columns.length !== 3) throw new Error(`第 ${index + 1} 行不是三列 TSV，请用制表符分隔`);
    return { country: columns[0].trim(), method: columns[1].trim(), currency: columns[2].trim() };
  });
}
$('openPaymentConfig').onclick = async () => {
  closeEnvMenu(); paymentPreview = null; $('savePaymentConfig').disabled = true; $('paymentConfigPreview').textContent = ''; $('paymentConfigMessage').textContent = '正在读取配置…'; $('paymentConfigDialog').showModal();
  try { await refreshPaymentConfig(); $('paymentConfigMessage').textContent = `当前 ${paymentRows.length} 条原始行；导入后先预览，再确认保存。`; }
  catch (error) { $('paymentConfigMessage').textContent = error.message; }
};
$('closePaymentConfig').onclick = () => $('paymentConfigDialog').close();
$('previewPaymentConfig').onclick = () => { try { previewPaymentRows(parsePaymentTsv($('paymentConfigPaste').value)); } catch (error) { paymentPreview = null; $('savePaymentConfig').disabled = true; $('paymentConfigMessage').textContent = error.message; } };
$('paymentConfigInput').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('JSON 配置超过 1 MB 上限');
    const data = JSON.parse(await file.text());
    if (data?.schemaVersion !== undefined && data.schemaVersion !== 1) throw new Error('支付配置版本不支持');
    previewPaymentRows(Array.isArray(data) ? data : data.rows);
  } catch (error) { paymentPreview = null; $('savePaymentConfig').disabled = true; $('paymentConfigMessage').textContent = error.message; }
  finally { event.target.value = ''; }
};
$('savePaymentConfig').onclick = async () => {
  if (!paymentPreview) return;
  clearCheckoutSession();
  $('savePaymentConfig').disabled = true;
  try {
    await post('/api/payment-config', { rows: paymentPreview });
    await refreshPaymentConfig(); await refreshProfiles(); paymentPreview = null;
    $('paymentConfigMessage').textContent = `已保存 ${paymentRows.length} 条原始行，下拉选项已更新。`;
  } catch (error) { $('paymentConfigMessage').textContent = error.message; $('savePaymentConfig').disabled = false; }
};
$('exportPaymentConfig').onclick = () => downloadFile('/api/payment-config/export', 'paymentConfigMessage');
$('closeDetail').onclick = () => $('detailDialog').close();
initOptions();
newOrderNo();
syncBilling();
updateRequired();
fetchPublicIP();
if (new URLSearchParams(location.search).has('result')) showError(new Error('已从收银台返回；回跳不代表付款成功，请通过服务端通知或查询确认最终状态。'));
refresh().catch(showError);
window.addEventListener('pagehide', clearCheckoutSession);
