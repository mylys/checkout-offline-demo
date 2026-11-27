'use strict';
(() => {
  const origin = new URL(location.href).origin;
  const transport = new MessageChannel();
  const port = transport.port1;
  let channel = null, generation = null, stopped = false, element = null, observer = null;
  let orderPromise = null, orderPayMethod = null, pendingOrder = null;
  const handlers = {};
  const send = (type, values = {}) => { if (!stopped && channel) port.postMessage({type,channel,generation,...values}); };
  const errorText = error => {
    const value = error?.detail ?? error;
    return typeof value === 'string' ? value.slice(0, 500) : typeof value?.message === 'string' ? value.message.slice(0, 500) : typeof value?.code === 'string' ? `SDK 错误：${value.code}` : '支付 SDK 报告异常，请核对网络及商户配置';
  };
  const fail = error => send('error', {message:errorText(error)});
  function loadSdk(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module'; script.src = url; script.referrerPolicy = 'no-referrer';
      const timer = setTimeout(() => { script.remove(); reject(new Error('SDK 脚本加载超时（20 秒）')); }, 20000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('SDK 脚本加载失败，请检查 CDN 网络连接')); };
      document.head.appendChild(script);
    });
  }
  function requestOrder({payMethod} = {}) {
    if (stopped) return Promise.reject(new Error('支付会话已失效'));
    if (typeof payMethod !== 'string' || !payMethod.trim()) return Promise.reject(new Error('SDK 未返回有效支付方式'));
    if (orderPayMethod && orderPayMethod !== payMethod) return Promise.reject(new Error('本次会话已绑定其他支付方式，请重新发起交易'));
    orderPayMethod = payMethod;
    if (!orderPromise) orderPromise = new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { pendingOrder = null; reject(new Error('订单请求超时，请先查询状态，勿重复付款')); }, 25000);
      pendingOrder = {requestId,resolve,reject,timer};
      send('requestOrder', {requestId,payMethod});
    });
    return orderPromise;
  }
  function validatePayload(payload) {
    const request = payload?.request;
    if (!request || !['elements','embedded','onepage'].includes(request.mode)) throw new Error('支付组件初始化参数无效');
    const url = new URL(payload.sdkUrl);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !(url.hostname === 'pingpongx.com' || url.hostname.endsWith('.pingpongx.com'))) throw new Error('SDK 脚本域名不受信任');
    if (request.mode !== 'embedded') {
      const expected = request.mode === 'elements'
        ? `https://acquirer-cdn.pingpongx.com/acquirer/components/sdk/${request.env}/v1/index.js`
        : `https://payssr-cdn.pingpongx.com/production-fra/acquirer-checkout-onepage/${request.env === 'sandbox' ? 'sandbox/' : ''}pp-checkout.js`;
      if (!['sandbox','production'].includes(request.env) || payload.sdkUrl !== expected || payload.session?.env !== request.env || payload.session?.region !== 'fra') throw new Error('SDK 环境与会话不一致');
    }
    if (request.mode === 'embedded') {
      const expectedPath = `/production-fra/acquirer-checkout-web/${request.env === 'sandbox' ? 'sandbox/' : ''}pp-checkout.js`;
      if (!['sandbox','production'].includes(request.env) || url.origin !== 'https://payssr-cdn.pingpongx.com' || url.pathname !== expectedPath) throw new Error('内嵌 SDK 脚本路径或环境不匹配');
    }
    if (request.mode === 'onepage' && (!Array.isArray(payload.session.allowedMethods) || !payload.session.allowedMethods.length || payload.session.allowedMethods.some(method => typeof method !== 'string' || !method.trim()))) throw new Error('OnePage 未返回有效的冻结支付方式列表');
    return request;
  }
  async function initialize(payload) {
    const request = validatePayload(payload), biz = request.bizContent;
    let checkout = null;
    if (request.mode !== 'elements') {
      checkout = document.createElement('pp-checkout');
      checkout.setAttribute('locale', biz.language || 'en');
      checkout.addEventListener('ready', () => send('ready'));
      checkout.addEventListener('error', fail);
      document.getElementById('sdkMount').appendChild(checkout);
    }
    await loadSdk(payload.sdkUrl);
    if (stopped) return;
    if (request.mode === 'elements') {
      const sdk = window.PingPongSDK;
      if (typeof sdk?.init !== 'function' || typeof sdk?.createElement !== 'function') throw new Error('SDK 未提供 PingPongSDK.init/createElement 接口');
      const methods = {applePayButton:'ApplePay',googlePayButton:'GooglePay',paypalButton:'PayPal'};
      if (!methods[request.elementType]) throw new Error('不支持的 Element SDK 组件');
      await sdk.init({mode:'Payment',env:request.env,amount:biz.amount,currency:biz.currency,country:biz.tradeCountry,
        accId:payload.session.accId,locale:biz.language || 'en',region:'fra',sdkAccessToken:payload.session.sdkAccessToken,
        merchantResultUrl:biz.payResultUrl,goods:biz.goods,
        createOrder: args => args?.payMethod === methods[request.elementType] ? requestOrder(args) : Promise.reject(new Error('本次组件不支持该支付方式（含 Venmo / PayPal Pay Later）'))});
      if (stopped) return;
      element = await sdk.createElement(request.elementType, request.elementType === 'googlePayButton' ? {isChallengeIframe:true} : {});
      if (stopped) { element.unmount(); return; }
      for (const event of ['ready','success','error','cancel']) {
        handlers[event] = detail => event === 'ready' ? send('ready') : event === 'error' ? fail(detail) : send('result', {status:event});
        element.on(event, handlers[event]);
      }
      element.mount('#sdkMount');
    } else {
      const sdk = window.PingPong?.Checkout;
      if (!sdk) throw new Error('SDK 未提供 PingPong.Checkout 接口');
      sdk.checkoutResultHook = result => send('result', {status:typeof result?.status === 'string' ? result.status : 'unknown'});
      if (request.mode === 'embedded') {
        sdk.customizeConfig = {layout:'accordion',displayCheckoutHeader:false,originalPay:true,isChallengeIframe:true};
        sdk.customizeStyles = {themeColor:'#0d6f63',themeColorLight:'#e9f6f0',fontFamily:'sans-serif'};
        if (typeof payload.token !== 'string' || !payload.token.trim()) throw new Error('缺少订单 token');
        checkout.setAttribute('accessToken', payload.token);
      } else {
        if (typeof sdk.create !== 'function') throw new Error('SDK 未提供 PingPong.Checkout.create 接口');
        sdk.beforeCheckoutHook = (args = {}) => {
          const methods = payload.session.allowedMethods;
          const payMethod = args?.payMethod;
          if (payMethod === undefined) {
            if (methods.length === 1 && methods[0] === 'GooglePay') return requestOrder({payMethod:'GooglePay'});
            return Promise.reject(new Error('SDK 未返回支付方式；Google Pay 请单选 GooglePay 重新发起，或改用 Element SDK'));
          }
          if (!methods.includes(payMethod)) return Promise.reject(new Error('支付方式不在本次冻结候选列表中'));
          return requestOrder({payMethod});
        };
        await sdk.create({amount:biz.amount,currency:biz.currency,tradeCountry:biz.tradeCountry,sdkAccessToken:payload.session.sdkAccessToken,
          originalPay:true,isChallengeIframe:true,paymentMethods:payload.session.allowedMethods,goods:biz.goods});
      }
    }
    observer = new ResizeObserver(() => send('resize', {height:document.getElementById('sdkMount').getBoundingClientRect().height + 20}));
    observer.observe(document.getElementById('sdkMount'));
  }
  port.onmessage = event => {
    const message = event.data;
    if (stopped || !message || typeof message.channel !== 'string' || !Number.isSafeInteger(message.generation)) return;
    if (channel === null) {
      if (message.type !== 'init' || !/^[a-f0-9-]{36}$/i.test(message.channel)) return;
      channel = message.channel; generation = message.generation;
      initialize(message.payload).catch(fail);
    } else if (message.channel === channel && message.generation === generation && message.type === 'orderResult' && pendingOrder && message.requestId === pendingOrder.requestId) {
      const pending = pendingOrder; pendingOrder = null; clearTimeout(pending.timer);
      if (typeof message.error === 'string') pending.reject(new Error(message.error));
      else if (typeof message.token === 'string' && message.token.trim()) pending.resolve(message.token);
      else pending.reject(new Error('预下单未返回有效 token'));
    }
  };
  if (parent !== window) parent.postMessage({type:'checkout-frame-ready'},origin,[transport.port2]);
  window.addEventListener('pagehide', () => {
    stopped = true; port.close(); observer?.disconnect();
    if (pendingOrder) { clearTimeout(pendingOrder.timer); pendingOrder.reject(new Error('支付会话已失效')); pendingOrder = null; }
    if (element) { for (const [event, handler] of Object.entries(handlers)) { try { element.off(event, handler); } catch {} } try { element.unmount(); } catch {} }
  });
})();
