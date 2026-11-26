// The sandbox gives this document an opaque origin. It receives only the single-order token.
(() => {
  const parentOrigin = new URL(location.href).origin;
  const channel = new MessageChannel();
  function report(type) { parent.postMessage({checkoutEmbed:type}, parentOrigin); }
  channel.port1.onmessage = event => {
    channel.port1.close();
    const {token,env} = event.data || {};
    if (!['production','sandbox'].includes(env) || typeof token !== 'string' || !token) return;
    const cashier = document.getElementById('cashier');
    cashier.addEventListener('ready', () => report('ready'));
    cashier.addEventListener('error', () => report('error'));
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://payssr-cdn.pingpongx.com/production-fra/acquirer-checkout-web/' + (env === 'sandbox' ? 'sandbox/' : '') + 'pp-checkout.js';
    script.onload = () => {
      const sdk = window.PingPong?.Checkout;
      if (!sdk) { report('error'); return; }
      sdk.customizeConfig = {layout:'accordion',displayCheckoutHeader:false,originalPay:true,isChallengeIframe:true};
      sdk.checkoutResultHook = () => report('result');
      cashier.setAttribute('accessToken',token);
    };
    script.onerror = () => report('error');
    document.head.append(script);
  };
  if (window !== parent) parent.postMessage({checkoutEmbed:'init'}, parentOrigin, [channel.port2]);
})();
