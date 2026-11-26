(() => {
  const origin = 'http://127.0.0.1:18791';
  const dialog = document.getElementById('workspace');
  const viewport = document.getElementById('viewport');
  const status = document.getElementById('status');
  const button = document.getElementById('connect');
  let timer, automatic = true;
  function reset() {
    clearTimeout(timer);
    viewport.replaceChildren();
    button.disabled = false;
  }
  function connect(manual) {
    reset();
    if (manual) { automatic = false; status.textContent = '正在连接这台电脑上的工作台…'; }
    const frame = document.createElement('iframe');
    frame.title = '本机支付工作台';
    frame.referrerPolicy = 'unsafe-url';
    frame.allow = 'payment; local-network-access; loopback-network';
    frame.src = origin + '/pages';
    viewport.appendChild(frame);
    button.disabled = manual;
    timer = setTimeout(() => {
      reset();
      if (manual) status.textContent = '请从桌面打开支付工作台，再点击连接。也可以直接使用工作台打开的浏览器窗口。';
    },15000);
  }
  window.addEventListener('message', event => {
    const frame = viewport.firstElementChild;
    if (!frame || event.origin !== origin || event.source !== frame.contentWindow || event.data?.type !== 'checkout-local-ready') return;
    clearTimeout(timer);
    if (!/^[2-9]\d*\./.test(event.data.version)) {
      reset();
      status.textContent = '检测到旧版联调台。请退出旧版，再安装并打开支付工作台。';
      return;
    }
    status.textContent = '';
    if (!dialog.open) dialog.showModal();
    button.disabled = false;
    frame.focus();
  });
  button.onclick = () => connect(true);
  document.getElementById('close').onclick = () => dialog.close();
  dialog.addEventListener('close',()=>{automatic=false;reset();button.focus();});
  function stopBackgroundProbe() {
    if (!automatic) return;
    automatic=false;
    if (!dialog.open) reset();
  }
  document.addEventListener('pointerdown',stopBackgroundProbe,{once:true,capture:true});
  document.addEventListener('keydown',stopBackgroundProbe,{once:true,capture:true});
  navigator.permissions?.query({name:'local-network-access'}).then(permission => {
    if (permission.state === 'granted' && automatic) connect(false);
  }).catch(()=>{});
})();
