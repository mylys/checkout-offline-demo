import {sha256} from './gateway.js?v=2.1.0';
const limit = 1024 * 1024;
const columns = ['environment','clientId','accId','salt','Remark','importMode'];

function checkArchive(buffer) {
  const bytes = new DataView(buffer);
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
async function rowsOf(file) {
  if (!/\.xlsx$/i.test(file.name) || file.size > limit) throw new Error('每个文件需为 1 MB 以内的 .xlsx');
  const bytes = await file.arrayBuffer();
  checkArchive(bytes);
  // Self-host the parser and only download it when the user selects a workbook.
  await import('./vendor/exceljs-4.4.0.min.js');
  const book = new globalThis.ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  const sheet = book.getWorksheet('环境配置');
  if (!sheet || sheet.rowCount > 1000 || sheet.columnCount > 40) throw new Error('需要「环境配置」工作表，最多 1000 行、40 列');
  const headers = new Map();
  sheet.getRow(1).eachCell((cell, i) => {
    const key = cell.value;
    if (!columns.includes(key) || headers.has(key)) throw new Error('表头未知或重复，请使用空白模板');
    headers.set(key, i);
  });
  for (const name of ['environment','accId','clientId','salt']) if (!headers.has(name)) throw new Error('缺少 ' + name + ' 列');
  const rows = [];
  for (let n=2; n<=sheet.rowCount; n++) {
    const row = sheet.getRow(n), record = {};
    for (const [key,i] of headers) {
      const value = row.getCell(i).value;
      if (value != null && typeof value !== 'string') throw new Error('第 ' + n + ' 行的 ' + key + ' 请使用文本单元格');
      record[key] = (value || '').trim();
    }
    if (![record.accId,record.clientId,record.salt,record.Remark].some(Boolean)) continue;
    if (!['production','sandbox'].includes(record.environment)) throw new Error('第 ' + n + ' 行环境须为 production 或 sandbox');
    if (!record.accId || !record.clientId || [record.salt,record.accId,record.clientId].some(s => s.includes('••••'))) throw new Error('第 ' + n + ' 行商户凭据不完整');
    rows.push({env:record.environment, accId:record.accId, clientId:record.clientId, salt:record.salt, remark:record.Remark, line:n});
  }
  return rows;
}
export async function importMerchants(files, current) {
  const next = new Map(current), batch = new Map();
  if (files.reduce((sum,f)=>sum + f.size,0) > 8*limit) throw new Error('所选文件合计超过 8 MB，请分批导入');
  for (const file of files) {
    try {
      for (const record of await rowsOf(file)) {
        const id = await sha256(JSON.stringify([record.env,record.accId,record.clientId]));
        const old = current.get(id);
        const salt = record.salt || old?.salt;
        if (!salt) throw new Error('第 ' + record.line + ' 行缺少签名密钥');
        const merchant = {...record, id, salt, remark:record.remark ?? old?.remark ?? ''};
        const prior = batch.get(id);
        if (prior && (prior.salt !== merchant.salt || prior.remark !== merchant.remark)) throw new Error('第 ' + record.line + ' 行与本批次另一行商户配置冲突');
        batch.set(id,merchant);
        next.set(id,merchant);
      }
    } catch (error) { throw new Error(file.name + '：' + error.message); }
  }
  if (!batch.size) throw new Error('文件中没有可导入的商户');
  return next;
}
