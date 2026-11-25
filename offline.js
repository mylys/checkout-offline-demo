(() => {
  const key = 'checkout-offline-demo-v1';
  let state;
  try { state = JSON.parse(sessionStorage.getItem(key)); } catch {}
  state ||= {env:'production',orders:[],rows:null};
  function save() { try { sessionStorage.setItem(key, JSON.stringify(state)); } catch {} }
  const response = Response.json.bind(Response);
  function config() {
    return {env:state.env, credentials:{sandbox:{configured:false},production:{configured:false}},merchants:{sandbox:[],production:[]},selectedMerchantIds:{}};
  }
  window.demoRequest = async (path, opts = {}) => {
    const url = new URL(path, location.origin);
    const body = JSON.parse(opts.body || '{}');
    switch (url.pathname) {
      case '/api/env':
        if (!['sandbox','production'].includes(body.env)) return response({error:'环境无效'},{status:400});
        state.env = body.env; save(); return response(config());
      case '/api/config': return response(config());
      case '/api/profiles': return response({version:'default-v1',data:window.demoProfiles});
      case '/api/public-ip': return response({ip:'192.0.2.1',fallback:true});
      case '/api/test-address': {
        const row = window.demoProfiles.shipping.find(item => item.country === url.searchParams.get('country'));
        if (!row) return response({error:'请选择国家或地区'},{status:400});
        return response({address:{country:row.country,state:row.state,city:row.city,postcode:row.postcode,street:Math.floor(1+Math.random()*9999)+' Sandbox Test Street'},notice:'演示用合成地址'});
      }
      case '/api/payment-config':
        if (opts.method === 'POST') { state.rows = body.rows; save(); }
        return response({version:'offline',rows:state.rows || CheckoutOptions.rows});
      case '/api/payment-config/template': return response({schemaVersion:1,rows:CheckoutOptions.rows});
      case '/api/payment-config/export': return response({schemaVersion:1,rows:state.rows || CheckoutOptions.rows});
      case '/api/orders': return response({orders:state.orders});
      case '/api/mock': {
        const b = body.bizContent;
        const order = {id:crypto.randomUUID(),env:state.env,mode:body.mode,merchantTransactionId:b.merchantTransactionId,amount:b.amount,currency:b.currency,status:'SIMULATED',simulated:true,createdAt:new Date().toISOString()};
        state.orders = [order,...state.orders].slice(0,100); save();
        return response({code:'MOCK',orderId:order.id,simulated:true,bizContent:{merchantTransactionId:order.merchantTransactionId,amount:order.amount,currency:order.currency}});
      }
      case '/api/mock-result': {
        const order = state.orders.find(item => item.id === body.id);
        if (!order || !['SIMULATED_SUCCESS','SIMULATED_FAILED','SIMULATED_CANCELLED'].includes(body.status)) return response({error:'无效的模拟订单或结果'},{status:400});
        order.status = body.status; save(); return response({order});
      }
      case '/api/orders/delete': state.orders = state.orders.filter(item=>item.id !== body.id); save(); return response({deleted:true});
      case '/api/orders/logs': return response({logs:[]});
      default: return response({error:'请在“本地联调”中使用此功能。'},{status:400});
    }
  };
})();
