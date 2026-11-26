// PingPong Checkout API v4. Keep the exact UTF-8 representation of every signed string.
const hosts = {
  production: 'https://acquirer-payment.pingpongx.com',
  sandbox: 'https://sandbox-acquirer-payment.pingpongx.com'
};
export async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
export async function sign(body, salt) {
  const pairs = [];
  for (const key of Object.keys(body).sort()) {
    const value = body[key];
    if (key === 'sign' || value == null) continue;
    if (typeof value !== 'string') throw new Error('网关签名字段格式无效');
    if (value.trim()) pairs.push(key + '=' + value);
  }
  return sha256(salt + pairs.join('&'));
}
export async function gateway(action, merchant, biz) {
  if (!['prePay','query'].includes(action) || !Object.hasOwn(hosts, merchant.env)) throw new Error('未知的网关操作或环境');
  const {accId, clientId, salt} = merchant;
  const body = {accId, clientId, signType:'SHA256', version:'1.0', bizContent:JSON.stringify(biz)};
  body.sign = await sign(body, salt);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let data;
  try {
    const response = await fetch(hosts[merchant.env] + '/v4/payment/' + action, {
      method:'POST', mode:'cors', credentials:'omit', redirect:'error', cache:'no-store',
      referrerPolicy:'no-referrer', signal:controller.signal, headers:{'Content-Type':'application/json', Accept:'application/json'}, body:JSON.stringify(body)
    });
    if (!response.ok) throw new Error('网关 HTTP ' + response.status);
    data = await response.json();
  } catch (error) {
    throw new Error('未取得有效网关响应。请检查网络和商户 IP 白名单，并核对原订单。' + (error.message.startsWith('网关 HTTP ') ? ' ' + error.message : ''));
  } finally { clearTimeout(timer); }
  if (!data || typeof data.sign !== 'string' || !/^[a-f0-9]{64}$/i.test(data.sign) || data.sign.toUpperCase() !== await sign(data, salt)) {
    throw new Error('网关响应验签失败，交易结果待核实');
  }
  if (data.accId !== undefined && data.accId !== accId || data.clientId !== undefined && data.clientId !== clientId) throw new Error('响应商户与所选商户不一致');
  const codes = action === 'query' ? ['000000','001000','002000'] : ['000000'];
  if (!codes.includes(data.code)) throw new Error('网关返回业务码 ' + String(data.code).slice(0,32));
  if (typeof data.bizContent !== 'string') throw new Error('响应缺少已签名的业务数据');
  const result = JSON.parse(data.bizContent);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('网关业务数据格式无效');
  if (result.accId !== undefined && result.accId !== accId || result.clientId !== undefined && result.clientId !== clientId) throw new Error('业务响应商户不匹配');
  if ((action === 'query' || result.merchantTransactionId !== undefined) && result.merchantTransactionId !== biz.merchantTransactionId) throw new Error('网关响应订单号不匹配');
  return result;
}
export function checkoutUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !/(^|\.)pingpongx\.com$/.test(url.hostname)) throw new Error('收银台地址无效');
  return url.href;
}
