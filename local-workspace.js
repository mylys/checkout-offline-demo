(() => {
  const origin = 'http://127.0.0.1:18791';
  const dialog = document.getElementById('localWorkspaceDialog');
  const viewport = document.getElementById('localViewport');
  const status = document.getElementById('localStatus');
  const launch = document.getElementById('loadLocal');
  let timer;
  document.getElementById('openLocal').onclick = () => dialog.showModal();
  document.getElementById('closeLocal').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    clearTimeout(timer);
    dialog.classList.remove('loading', 'connected');
    viewport.replaceChildren();
    document.getElementById('localTitle').textContent = '本地联调';
    status.textContent = 'v1.1.0 · 127.0.0.1:18791';
    launch.textContent = '在此页加载';
  });
  launch.onclick = () => {
    clearTimeout(timer);
    dialog.classList.add('loading');
    status.textContent = '正在连接本机。如浏览器询问，请允许访问本地网络。';
    const frame = document.createElement('iframe');
    frame.title = '本机支付联调工作区';
    frame.referrerPolicy = 'unsafe-url';
    frame.allow = 'payment; local-network-access; loopback-network';
    frame.src = origin + '/pages';
    viewport.replaceChildren(frame);
    timer = setTimeout(() => {
      dialog.classList.remove('loading');
      viewport.replaceChildren();
      launch.textContent = '重新连接';
      status.textContent = '尚未连上本机。请确认启动窗口仍在运行；若浏览器限制内嵌访问，请选择“独立窗口打开”。';
    }, 15000);
  };
  window.addEventListener('message', event => {
    const frame = viewport.querySelector('iframe');
    if (event.origin !== origin || !frame || event.source !== frame.contentWindow || event.data?.type !== 'checkout-local-ready') return;
    clearTimeout(timer);
    dialog.classList.remove('loading');
    dialog.classList.add('connected');
    document.getElementById('localTitle').textContent = '本地联调 · 127.0.0.1';
  });
})();
