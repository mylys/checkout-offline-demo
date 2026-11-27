if (new URLSearchParams(location.search).get('via') === 'web') {
  let sameTab = false;
  try { sameTab = !!sessionStorage.getItem('checkout-offline-demo.web.form.v1') || !!sessionStorage.getItem('checkout-offline-demo.web.orders.v2'); } catch {}
  document.querySelector('#return-status').textContent = sameTab
    ? '返回工作台后，在订单列表选择 Query → Sale Query 确认支付状态。'
    : '请切回发起交易的工作台标签页，在订单列表选择 Query → Sale Query 确认支付状态。';
  const link = document.querySelector('#return-link');
  link.href = sameTab ? './#ordersWorkspace' : './';
  link.textContent = sameTab ? '返回工作台订单列表' : '打开新的工作台';
} else {
  document.querySelector('#return-link').href = 'http://127.0.0.1:18791/#ordersWorkspace';
}
