const desktop = new URLSearchParams(location.search).get('desktop') === '1';
document.querySelector('#browser').hidden = desktop;
document.querySelector('#desktop').hidden = !desktop;
if (desktop) {
  const link = document.querySelector('#view-switch');
  link.href = './';
  link.textContent = '浏览器版';
  await import('./local-workspace.js?v=2.1.0');
} else {
  await import('./checkout-options.js?v=2.1.0');
  await import('./workbench.js?v=2.1.0');
}
