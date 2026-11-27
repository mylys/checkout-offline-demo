try {
  if (new URLSearchParams(location.search).get('desktop') === '1') {
    document.querySelector('link[rel=stylesheet]').href = './styles.css?v=2.2.0';
    document.body.replaceChildren(document.querySelector('#desktop-view').content.cloneNode(true));
    await import('./local-workspace.js?v=2.2.0');
  } else {
    await import('./checkout-options.js?v=2.2.0');
    await import('./workbench.js?v=2.2.0');
    if (location.hash === '#orders') document.getElementById('ordersWorkspace').scrollIntoView();
  }
} catch {
  const message = document.createElement('p');
  message.textContent = '工作台未能加载。请检查网络后刷新页面，或用最新版浏览器重新打开。';
  const retry = document.createElement('button');
  retry.textContent = '重新加载';
  retry.onclick = () => location.reload();
  document.body.replaceChildren(message, retry);
} finally {
  document.body.inert = false;
  document.body.removeAttribute('aria-busy');
}
