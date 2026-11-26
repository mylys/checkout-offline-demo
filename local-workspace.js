(() => {
  const origin = 'http://127.0.0.1:18791';
  const dialog = document.getElementById('localWorkspaceDialog');
  const viewport = document.getElementById('localViewport');
  const menu = document.getElementById('localTools');
  const status = document.getElementById('localStatus');
  const entry = document.getElementById('openLocal');
  let deadline, retry;

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
    deadline = setTimeout(() => {
      if (!dialog.open || viewport.firstElementChild !== frame) return;
      dialog.classList.add('waiting');
      status.textContent = '尚未连接 127.0.0.1:18791。请确认启动窗口已打开，并允许浏览器访问本地网络。';
      retry = setTimeout(retryIfVisible, 15000);
    }, 8000);
  }

  function openWorkspace() {
    if (dialog.open) return;
    dialog.showModal();
    connect();
  }

  window.addEventListener('message', event => {
    if (!dialog.open || event.origin !== origin || event.source !== viewport.firstElementChild?.contentWindow || event.data?.type !== 'checkout-local-ready') return;
    clearTimers();
    dialog.classList.remove('waiting');
    dialog.classList.add('connected');
    viewport.inert = false;
    const version = event.data.version;
    document.getElementById('localVersion').textContent = /^\d+\.\d+\.\d+$/.test(version) ? '本地联调 · v' + version : '本地联调';
    document.getElementById('updateLocal').hidden = version !== '1.1.0';
    viewport.firstElementChild.focus();
  });

  dialog.addEventListener('close', () => {
    clearTimers();
    dialog.classList.remove('waiting', 'connected');
    viewport.replaceChildren();
    viewport.inert = true;
    menu.open = false;
    status.textContent = '正在连接本机联调台…';
    entry.focus();
  });
  document.getElementById('loadLocal').onclick = connect;
  document.getElementById('closeLocal').onclick = () => dialog.close();
  document.getElementById('showOffline').onclick = () => dialog.close();
  entry.onclick = openWorkspace;
  document.addEventListener('visibilitychange', retryIfVisible);
  openWorkspace();
})();
