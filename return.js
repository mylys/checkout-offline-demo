if (new URLSearchParams(location.search).get('via') === 'web') {
  document.querySelector('#return-status').textContent = '请返回本标签页的订单列表，重新导入原商户 Excel，点击「查询支付结果」。成功或取消回跳均不能确认最终支付状态。';
  const link = document.querySelector('#return-link');
  link.href = './#orders';
  link.textContent = '查看浏览器订单';
}
