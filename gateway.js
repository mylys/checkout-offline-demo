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
export async function verifySign(body, salt) {
  try {
    return typeof body?.sign === 'string' && /^[a-f0-9]{64}$/i.test(body.sign) && body.sign.toUpperCase() === await sign(body,salt);
  } catch { return false; }
}
