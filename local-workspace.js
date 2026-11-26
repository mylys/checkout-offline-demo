(() => {
  const origin = 'http://127.0.0.1:18791';
  const dialog = document.getElementById('localWorkspaceDialog');
  const viewport = document.getElementById('localViewport');
  const menu = document.getElementById('localTools');
  const status = document.getElementById('localStatus');
  const entry = document.getElementById('openLocal');
  const lastConnection = 'checkout-offline-demo.local-connected';
  let deadline, retry, demoInUse = false;

  function clearTimers() {
    clearTimeout(deadline);
    clearTimeout(retry);
  }

  function retryIfVisible() {
    if (dialog.open && dialog.classList.contains('waiting') && !document.hidden) connect();
  }

  function connect() {
    clearTimers();
    const frame = document.createElement('iframe');
    frame.title = '本机支付联调工作区';
    frame.referrerPolicy = 'unsafe-url';
    frame.allow = 'payment; local-network-access; loopback-network';
    frame.src = origin + '/pages';
    viewport.replaceChildren(frame);
    status.textContent = '正在连接这台电脑上的联调台…';
    deadline = setTimeout(() => {
      if (viewport.firstElementChild !== frame) return;
      if (!dialog.open) {
        viewport.replaceChildren();
        return;
      }
      dialog.classList.add('waiting');
      status.textContent = '本机服务尚未连接。启动运行包后会自动重试；浏览器询问时，请允许访问本地网络。';
      retry = setTimeout(retryIfVisible, 15000);
    }, 8000);
  }

  async function connectOnArrival() {
    // A new browser can use the demo without a local-network permission prompt.
    try {
      const permission = await navigator.permissions.query({name:'local-network-access'});
      if (permission.state !== 'granted') return;
    } catch {
      // Without a permission signal, probe only on browsers previously connected here.
      try { if (localStorage.getItem(lastConnection) !== '1') return; }
      catch { return; }
    }
    if (!demoInUse && !dialog.open) connect();
  }

  function keepDemo() {
    demoInUse = true;
    if (!dialog.open) {
      clearTimers();
      viewport.replaceChildren();
    }
  }
  document.addEventListener('pointerdown', keepDemo, {capture:true, once:true});
  document.addEventListener('keydown', keepDemo, {capture:true, once:true});

  entry.onclick = () => {
    if (dialog.open) return;
    demoInUse = true;
    dialog.showModal();
    connect();
  };

  window.addEventListener('message', event => {
    const frame = viewport.firstElementChild;
    if (!frame || event.origin !== origin || event.source !== frame.contentWindow || event.data?.type !== 'checkout-local-ready') return;
    clearTimers();
    if (!dialog.open) {
      if (demoInUse) return;
      dialog.showModal();
    }
    try { localStorage.setItem(lastConnection,'1'); } catch {}
    dialog.classList.remove('waiting');
    dialog.classList.add('connected');
    viewport.inert = false;
    const version = event.data.version;
    document.getElementById('localVersion').textContent = /^\d+\.\d+\.\d+$/.test(version) ? '本地联调 · v' + version : '本地联调';
    document.getElementById('updateLocal').hidden = version !== '1.1.0';
    frame.focus();
  });

  dialog.addEventListener('close', () => {
    clearTimers();
    dialog.classList.remove('waiting', 'connected');
    viewport.replaceChildren();
    viewport.inert = true;
    menu.open = false;
    entry.focus();
  });
  document.getElementById('loadLocal').onclick = connect;
  document.getElementById('closeLocal').onclick = () => dialog.close();
  document.getElementById('showOffline').onclick = () => dialog.close();
  document.addEventListener('visibilitychange', retryIfVisible);
  connectOnArrival();
})();
