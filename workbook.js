const limit = 1024 * 1024;
export function ipVersion(ip) {
  if (typeof ip !== 'string') return 0;
  if (/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(ip) && ip.split('.').every(n => Number(n) <= 255)) return 4;
  if (ip.includes(':') && /^[a-f\d:.]+$/i.test(ip)) {
    try { new URL('http://[' + ip + ']'); return 6; } catch {}
  }
  return 0;
}
export async function newWorkbook() {
  await import('./vendor/exceljs-4.4.0.min.js');
  return new globalThis.ExcelJS.Workbook();
}
export function decode(base64) {
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}
export function checkArchive(buffer) {
  const bytes = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const u16 = p => bytes.getUint16(p, true), u32 = p => bytes.getUint32(p, true);
  let end = buffer.byteLength - 22;
  while (end >= Math.max(0, buffer.byteLength - 65557) && u32(end) !== 0x06054b50) end--;
  if (end < 0 || u32(end) !== 0x06054b50 || u16(end+4) || u16(end+6)) throw new Error('需要标准 .xlsx 文件');
  const count = u16(end+10);
  let cursor = u32(end+16), expanded = 0;
  if (!count || count > 256) throw new Error('工作簿文件条目过多');
  for (let i = 0; i < count; i++) {
    if (cursor+46 > end || u32(cursor) !== 0x02014b50) throw new Error('工作簿目录无效');
    expanded += u32(cursor+24);
    if (expanded > 10*limit || (u16(cursor+8)&1)) throw new Error('工作簿已加密或内容超过 10 MB');
    cursor += 46 + u16(cursor+28) + u16(cursor+30) + u16(cursor+32);
  }
}
