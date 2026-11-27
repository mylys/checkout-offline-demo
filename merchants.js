import {sha256} from './gateway.js?v=2.2.0';
const ENVS = ['production', 'sandbox'];
const empty = () => ({ accId:'', clientId:'', salt:'' });
const blankMerchant = credentials => !['accId','clientId','salt','remark'].some(key => credentials[key]);
export function createMerchants(state,fail) {
  function clear() {
    state.merchants = {production:[],sandbox:[]};
    state.selectedMerchantIds = {production:'',sandbox:''};
  }
  clear();
  const validEnv = env => { if (!ENVS.includes(env)) fail('环境无效'); return env; };
  const active = env => state.merchants[env].find(item => item.id === state.selectedMerchantIds[env])?.credentials || empty();
  function resolve(env, merchantId) {
    validEnv(env);
    const id = merchantId === undefined ? state.selectedMerchantIds[env] : merchantId;
    if (typeof id !== 'string') fail('merchantId 必须为文本');
    const row = state.merchants[env].find(item => item.id === id);
    if (!row) fail('商户不存在或已被移除，请重新选择',409);
    return row;
  }
  function commit(merchants, selectedMerchantIds) {
    state.merchants = merchants; state.selectedMerchantIds = selectedMerchantIds;
  }
  function select({env,merchantId}) {
    if (typeof merchantId !== 'string' || !merchantId) fail('选择商户必须提供 merchantId');
    const row = resolve(env,merchantId);
    commit(state.merchants,{...state.selectedMerchantIds,[env]:row.id});
  }
  async function importRows(rows, strategy) {
    const merchants = structuredClone(state.merchants), selected = {...state.selectedMerchantIds}, groups = new Map(), duplicateRows = [];
    for (const [index,row] of rows.entries()) {
      const env = validEnv(row.environment), fileMode = row.importMode || 'merge';
      const mode = strategy === 'merge' ? 'merge' : fileMode;
      if (row.Remark?.length > 500) fail('Remark 不能超过 500 字符');
      if (!['merge','replace'].includes(fileMode)) fail('环境 importMode 仅支持 merge、replace 或留空');
      if (mode === 'merge' && !row.accId && !row.clientId && !row.salt && !row.Remark) continue;
      if (!groups.has(env)) groups.set(env,{mode,rows:[],byIdentity:new Map()});
      const group = groups.get(env);
      if (group.mode !== mode) fail('同一环境不能混用 merge 与 replace');
      const key = JSON.stringify([row.accId,row.clientId]);
      const duplicate = group.byIdentity.get(key);
      if (duplicate) {
        const firstRow = duplicate._excelRow ?? rows.indexOf(duplicate) + 2, duplicateRow = row._excelRow ?? index + 2;
        if (['accId','clientId','salt','Remark'].some(key => duplicate[key] !== row[key])) {
          const where = row._fileNumber ? `文件 ${duplicate._fileNumber} 第 ${firstRow} 行与文件 ${row._fileNumber} 第 ${duplicateRow} 行` : `环境配置第 ${firstRow}、${duplicateRow} 行`;
          fail(`${where}重复商户身份但配置内容冲突，请统一后重试`);
        }
        duplicateRows.push({environment:env,firstRow,duplicateRow});
        continue;
      }
      group.byIdentity.set(key,row);
      group.rows.push(row);
    }
    for (const [env,group] of groups) {
      const oldRows = new Map(state.merchants[env].map(item => [JSON.stringify([item.credentials.accId,item.credentials.clientId]),item]));
      const retained = group.mode === 'replace' ? [] : merchants[env];
      const byId = new Map(retained.map(item => [item.id,item]));
      for (const row of group.rows) {
        const old = oldRows.get(JSON.stringify([row.accId,row.clientId]));
        if (group.mode === 'replace' && !['accId','clientId','salt'].every(key => Object.hasOwn(row,key))) fail('完整恢复必须包含所有凭据列');
        if (group.mode === 'merge' && (!row.accId || !row.clientId || (!row.salt && !old?.credentials.salt))) fail('环境凭据不完整；仅匹配商户允许保留原 salt');
        for (const key of ['accId','clientId','salt']) if (row[key]?.includes('••••')) fail('不能导入脱敏占位符');
        const credentials = { accId:row.accId, clientId:row.clientId, salt:group.mode === 'replace' ? row.salt : row.salt || old.credentials.salt };
        if (Object.hasOwn(row,'Remark')) { if (row.Remark) credentials.remark = row.Remark; }
        else if (group.mode === 'merge' && old?.credentials.remark !== undefined) credentials.remark = old.credentials.remark;
        if (blankMerchant(credentials)) continue;
        if (!credentials.accId || !credentials.clientId || !credentials.salt) fail('商户凭据不完整');
        credentials.fingerprint = (await sha256(JSON.stringify([env,credentials.accId,credentials.clientId]))).toLowerCase();
        credentials.revision = old?.credentials.salt === credentials.salt ? old.credentials.revision : crypto.randomUUID();
        const id = credentials.fingerprint;
        byId.set(id,{id,credentials});
      }
      const next = [...byId.values()];
      merchants[env] = next;
      if (!next.some(row => row.id === selected[env])) selected[env] = next[0]?.id || '';
      const current = next.find(row => row.id === selected[env]);
      if (group.mode === 'merge' && current && ['accId','clientId','salt'].every(key => !current.credentials[key])) {
        selected[env] = next.find(row => ['accId','clientId','salt'].every(key => row.credentials[key]))?.id || selected[env];
      }
    }
    return {merchants,selected,importedEnvironments:[...groups.keys()],importSummary:{merchantCount:[...groups.values()].reduce((sum,group)=>sum+group.rows.length,0),duplicateRows}};
  }
  function forOrder(order) {
    validEnv(order.env);
    if (!order.merchantFingerprint) fail('旧历史缺少商户身份绑定，无法安全确定原商户；请人工核实',409);
    const matches = state.merchants[order.env].filter(row => row.credentials.fingerprint === order.merchantFingerprint && (!order.merchantId || row.id === order.merchantId));
    if (matches.length !== 1) fail('原订单商户身份缺失、已变化或存在歧义，禁止操作',409);
    return matches[0];
  }
  return {resolve,commit,select,importRows,forOrder,active,clear};
}
