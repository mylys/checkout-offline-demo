if (new URLSearchParams(location.search).get('via') === 'web') {
  document.querySelector('#return-status').textContent = '请返回本标签页的订单列表，重新导入原商户 Excel，选择 Query → Sale Query。成功或取消回跳均不能确认最终支付状态。';
  const link = document.querySelector('#return-link');
  link.href = './#ordersWorkspace';
  link.textContent = '查看浏览器订单';
} else {
  document.querySelector('#return-link').href = 'http://127.0.0.1:18791/#ordersWorkspace';
}
