if (new URLSearchParams(location.search).get('desktop') === '1') {
  document.querySelector('link[rel=stylesheet]').href = './styles.css?v=2.2.0';
  document.body.replaceChildren(document.querySelector('#desktop-view').content.cloneNode(true));
  await import('./local-workspace.js?v=2.2.0');
} else {
  await import('./checkout-options.js?v=2.2.0');
  await import('./workbench.js?v=2.2.0');
  if (location.hash === '#orders') document.getElementById('ordersWorkspace').scrollIntoView();
}
