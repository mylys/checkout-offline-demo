'use strict';
// 支付配置默认数据：用户于2026-11-17提供的原始三列快照，重复和空值保留供审计。
(function (root) {
  const countries = [
    {value:'MY',label:'马来西亚'},{value:'ID',label:'印度尼西亚'},{value:'JP',label:'日本'},
    {value:'VN',label:'越南'},{value:'TH',label:'泰国'},{value:'PH',label:'菲律宾'},
    {value:'HK',label:'中国香港'},{value:'CN',label:'中国'},{value:'KR',label:'韩国'},{value:'SG',label:'新加坡'}
  ];
  const currencies = {USD:2,EUR:2,GBP:2,SGD:2,CNY:2,JPY:0,HKD:2,THB:2,IDR:2,MYR:2,VND:0,KRW:0,PHP:2,CAD:2,AUD:2,SEK:2,NOK:2,DKK:2,NZD:2,CHF:2};
  const raw = `MY, XB	VISA	MYR
MY, XB	Mastercard	MYR
MY, XB	Discover	MYR
MY, XB	DinersClub	MYR
MY, XB	CHINA UNION PAY	MYR
MY, XB	American Express	MYR
MY, XB	VISA, Mastercard	MYR
MY, XB	Bank Of China	MYR
MY, XB	Agrobank	MYR
MY, XB	Kuwait Finance House	MYR
MY, XB	Affin Bank	MYR
MY, XB	Bank Islam	MYR
MY, XB	Bank Muamalat	MYR
MY, XB	Bank Rakyat	MYR
MY, XB	Bank Simpanan Nasional	MYR
MY, XB	CIMB Clicks	MYR
MY, XB	HSBC Bank	MYR
MY, XB	Maybank2U	MYR
MY, XB	UOB Bank	MYR
MY, XB	Am Online	MYR
MY, XB	HLB Connect	MYR
MY, XB	PBeBank	MYR
MY, XB	RHB Now	MYR
MY, XB	Stand Chart Bank	MYR
MY, XB	Alliance Bank	MYR
MY, XB	OCBC Bank	MYR
MY, XB	Boost	MYR
MY, XB	TNG eWallet	MYR
MY, XB	GrabPay	MYR
MY, XB	Shopeepay	MYR
MY, XB	TNG MiniApp	MYR
MY, XB	Maybank QRPay	MYR
MY, XB	ShopBack	MYR
MY, XB	Alipay	MYR
MY, XB	WeChat Pay	MYR
MY, XB	DuitNow	MYR
MY, XB	Wechat-Offline, ScanWalletQR, QR-POSScan	MYR
MY, XB	ScanWalletQR, QR-POSScan, Alipay-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, Atome-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, Alipay+-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, ShopeePay-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, UnionPay-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, GrabPay-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, MAE by Maybank2u-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, Boost-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, Alipay Pre-Auth-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, TNG-D-Offline	MYR
MY, XB	Card Purchase	MYR
MY, XB	Card Purchase	MYR
MY, XB	Card Purchase	MYR
MY, XB	Card Purchase	MYR
MY, XB	Card Purchase	MYR
MY, XB	Card Purchase
MY, XB	DuitNow, QR Payment	MYR
MY, XB	Wechat-Offline, ScanWalletQR, QR-POSScan	MYR
MY, XB	ScanWalletQR, QR-POSScan, Alipay-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, Atome-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, Alipay+-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, ShopeePay-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, UnionPay-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, GrabPay-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, MAE by Maybank2u-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, Boost-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, Alipay Pre-Auth-Offline	MYR
MY, XB	ScanWalletQR, QR-POSScan, TNG-D-Offline	MYR
MY	TNG eWallet	MYR
MY	QR-POSScan / ScanWalletQR / TNG-D-Offline	MYR
MY	QR Payment	MYR
MY	DuitNow	MYR
MY	Card Purchase	MYR
MY	Card Purchase	MYR
MY	Card Purchase	MYR
MY	ScanWalletQR, QR-POSScan, TNG-D-Offline	MYR
MY	ScanWalletQR, QR-POSScan, Boost-Offline	MYR
MY	ScanWalletQR, QR-POSScan, GrabPay-Offline	MYR
MY	ScanWalletQR, QR-POSScan, Alipay+-Offline	MYR
MY	QR Payment	MYR
MY	DuitNow	MYR
MY	VISA	MYR
MY	VISA	MYR
MY	Mastercard	MYR
MY	Mastercard	MYR
MY	VISA, Mastercard	MYR
MY	VISA, Mastercard	MYR
MY	TNG eWallet	MYR
MY	Boost	MYR
MY	GrabPay	MYR
MY	Alipay+ / Alipay	MYR
MY	Affin Bank	MYR
MY	Alliance Bank (Personal)	MYR
MY	AGRONet	MYR
MY	AmBank	MYR
MY	Bank Islam	MYR
MY	Bank Muamalat	MYR
MY	Bank Rakyat	MYR
MY	Bank Of China	MYR
MY	BSN	MYR
MY	CIMB Clicks	MYR
MY	Hong Leong Bank	MYR
MY	HSBC Bank	MYR
MY	KFH	MYR
MY	Maybank2E	MYR
MY	Maybank2U	MYR
MY	OCBC Bank	MYR
MY	Public Bank	MYR
MY	RHB Bank	MYR
MY	Standard Chartered Bank	MYR
MY	UOB Bank	MYR
MY	Affin Bank(B2B)	MYR
MY	Agrobank(B2B)	MYR
MY	Alliance Bank(B2B)	MYR
MY	AmBank(B2B)	MYR
MY	Bank Islam(B2B)	MYR
MY	Bank Kerjasama Rakyat(B2B)	MYR
MY	Bank Muamalat(B2B)	MYR
MY	BNP Paribas(B2B)	MYR
MY	CIMB Bank(B2B)	MYR
MY	CITI Bank(B2B)	MYR
MY	Deutsche Bank(B2B)	MYR
MY	Hong Leong Bank(B2B)	MYR
MY	HSBC Bank(B2B)	MYR
MY	Kuwait Finance House(B2B)	MYR
MY	Malayan Banking(B2B)	MYR
MY	OCBC Bank(B2B)	MYR
MY	Public Bank Enterprise(B2B)	MYR
MY	Public Bank(B2B)	MYR
MY	RHB Bank(B2B)	MYR
MY	Standard Chartered Bank(B2B)	MYR
MY	United Overseas Bank(B2B)	MYR
ID, XB	VISA	IDR
ID, XB	Mastercard	IDR
ID, XB	JCB	IDR
ID, XB	AMEX	IDR
ID, XB	Shopeepay	IDR
ID, XB	OVO	IDR
ID, XB	LinkAja	IDR
ID, XB	DANA	IDR
ID, XB	GoPay	IDR
ID, XB	Qris	IDR
ID, XB	BCA	IDR
ID, XB	BNI	IDR
ID, XB	BRI	IDR
ID, XB	Mandiri	IDR
ID, XB	CIMB	IDR
ID, XB	Indodana	IDR
ID, XB	JeniusPay	IDR
ID, XB	Indomaret	IDR
ID, XB	Alfamart	IDR
ID	Card Purchase	IDR
ID	Card Purchase	IDR
ID	Card Purchase	IDR
ID	Card Purchase	IDR
ID	Card Purchase	IDR
ID	Qris	IDR
JP	VISA	JPY
JP	Mastercard	JPY
JP	JCB	JPY
JP	PayPay	JPY
JP	docomo	JPY
JP	Rpay	JPY
JP	merPay	JPY
JP	auPay	JPY
JP	Alipay+	JPY
JP	WeChat	JPY
JP	UnionPay	JPY
JP	QR-POSScan
JP	QR-POSScan
JP	QR-POSScan
JP	QR-POSScan
JP	QR-POSScan
JP	QR-POSScan
JP	QR-POSScan
JP	QR-POSScan
JP	Card Purchase	JPY
JP	Card Purchase	JPY
JP	Card Purchase	JPY
JP	Card Purchase	JPY
JP	Card Purchase	JPY
JP	Card Purchase	JPY
JP	ICFC	JPY
JP	ICFC	JPY
JP	RKTEDYFC	JPY
JP	NANACOFC	JPY
VN	VietQR	VND
TH, XB	PromptPay	THB
TH, XB	American Express	THB
TH, XB	JCB	THB
TH, XB	VISA	THB
TH, XB	Mastercard	THB
TH, XB	WeChat Pay	THB
TH, XB	Wechat-Offline	THB
TH, XB	Shopeepay	THB
TH, XB	Truemoney	THB
TH, XB	Rabbit LINE Pay	THB
TH, XB	KMA	THB
TH, XB	Easy KTB	THB
TH, XB	SCB	THB
TH, XB	KPLUS	THB
TH	VISA	THB
TH	Mastercard
TH	provider=prompt_pay	THB
TH	provider=wechatpay
TH	provider=mobile_banking;payerBank=bbl_mobile_banking
TH	provider=mobile_banking;payerBank=scb	THB
TH	provider=mobile_banking;payerBank=ttb
TH	provider=alipay_plus	THB
VN	JCB	THB
VN	Mastercard	THB
VN	VISA	THB
VN	ZaloPay	VND
VN	VnptPay	VND
VN	ViettelPay	VND
VN	ShopeePay-Offline	VND
VN	AppotaPay	VND
VN	Bank transfer	VND
VN	Card Purchase	VND
VN	Card Purchase	VND
VN	Card Purchase	VND
VN	Card Purchase	VND
VN	Card Purchase	VND
VN	Card Purchase	VND
VN	VNM QR	VND
MY	DuitNow	MYR
MY	QR Payment	MYR
MY	DuitNow
MY	QR Payment
PH, XB	BDO Online Payment	PHP
PH, XB	UnionBank Online Payment	PHP
PH, XB	BPI Online Payment	PHP
PH, XB	RCBC Online Payment	PHP
PH, XB	Payso	PHP
PH, XB	Paymaya	PHP
PH, XB	GrabPay	PHP
PH, XB	GCash	PHP
PH, XB	ecPay OTC	PHP
PH, XB	RD Pawnshop OTC	PHP
PH, XB	7–Eleven OTC	PHP
PH, XB	Gcash billspayment	PHP
PH, XB	QR Ph	PHP
VN	VISA	VND
VN	Mastercard	VND
VN	JCB	VND
VN	CHINA UNION PAY	VND
VN	American Express	VND
VN	ABBANK(Card)	VND
VN	LIENVIETBANK(Card)	VND
VN	KIENLONGBANK(Card)	VND
VN	IVB(Card)	VND
VN	HDBANK(Card)	VND
VN	GPBANK(Card)	VND
VN	EXIMBANK(Card)	VND
VN	BAOVIETBANK(Card)	VND
VN	BACABANK(Card)	VND
VN	ACB(Card)	VND
VN	MAFC(Card)	VND
VN	VIETCAPITALBANK(Card)	VND
VN	TPBANK(Card)	VND
VN	TECHCOMBANK(Card)	VND
VN	MBBANK(Card)	VND
VN	VIETINBANK(Card)	VND
VN	AGRIBANK(Card)	VND
VN	BIDV(Card)	VND
VN	VIETCOMBANK(Card)	VND
VN	SEABANK(Card)	VND
VN	VRB(Card)	VND
VN	VPBANK(Card)	VND
VN	VIETCREDIT(Card)	VND
VN	VIETBANK(Card)	VND
VN	VIETABANK(Card)	VND
VN	VIDBANK(Card)	VND
VN	VIB(Card)	VND
VN	UOB(Card)	VND
VN	SHINHANBANK(Card)	VND
VN	WOORIBANK(Card)	VND
VN	SCB(Card)	VND
VN	SAIGONBANK(Card)	VND
VN	PVCOMBANK(Card)	VND
VN	PGBANK(Card)	VND
VN	OCB(Card)	VND
VN	NCB(Card)	VND
VN	NAMABANK(Card)	VND
VN	MSBANK(Card)	VND
VN	VNPAY QR	VND
HK	VISA	USD,EUR,GBP,HKD
HK	Mastercard	USD,EUR,GBP,HKD,JPY
HK	GooglePay	USD,EUR,GBP,HKD,JPY
HK	ApplePay	USD,EUR,GBP,HKD,JPY
HK	JCB	EUR,HKD,JPY,CAD,GBP,USD,AUD
HK, XB	Discover	USD
HK, XB	DinersClub	USD
HK, XB	GooglePay	USD
HK, XB	ApplePay	USD
HK	CHINA UNION PAY	USD,EUR,HKD,GBP,JPY,SGD,SEK,NOK,DKK,NZD,CHF,AUD,CAD,CNY
HK	AMEX	USD,EUR,GBP,HKD,AUD,SGD,CAD,JPY,DKK
HK	OCTOPUS	HKD
HK	DANA
HK	GCASH	USD
HK	TOUCH_N_GO
HK	ALIPAYHK	HKD
HK	ALIPAY	HKD
HK	ALIPAYHK	HKD
HK	Alipay+	HKD
HK	ALIPAY	USD,HKD
HK	RABBIT_LINE_PAY
HK	KAKAO_PAY
HK	BPI	USD
HK	BOOST	USD
HK	AlipayHK-Offline	HKD
CN, HK	WeChat Pay	HKD
HK, CN	Wechat-Offline	HKD
KR	Card Purchase	KRW
KR	Card Purchase	KRW
KR	Card Purchase	KRW
KR	Card Purchase	KRW
KR	Card Purchase	KRW
KR	Card Purchase UnionPay	KRW
KR	QR POSScan	KRW
KR	QR POSScan	KRW
KR	QR POSScan	KRW
KR	QR POSScan	KRW
KR	QR POSScan	KRW
KR	QR POSScan	KRW
KR	QR POSScan	KRW
KR	Overseas VISA	KRW
KR	Overseas Mastercard	KRW
KR	Overseas JCB	KRW
KR	Overseas DinersClub	KRW
KR	Overseas Amex	KRW
KR	Overseas Unionpay	KRW
KR	SHINHANCard	KRW
KR	HYUNDAICard	KRW
KR	LOTTECard	KRW
KR	KEBCard	KRW
KR	SAMSUNGCard	KRW
KR	KOOKMINCard	KRW
KR	BCCard	KRW
KR	NONGHYUPCard	KRW
KR	HANACard	KRW
KR	CITICard	KRW
KR	WOORICard	KRW
KR	Hana BCCard	KRW
KR	KBank	KRW
KR	KWANGJUCard	KRW
KR	SUHYUPCard	KRW
KR	JEJUCard	KRW
KR	KDB	KRW
KR	Saving Bank	KRW
KR	Shinhyup	KRW
KR	Post Office	KRW
KR	MGCard	KRW
KR	KAKAOBank	KRW
KR	KR UnionPay	KRW
KR	PAYCO	KRW
KR	SAMSUNGPAY	KRW
KR	SSGPAY	KRW
KR	L.PAY	KRW
KR	Kakaopay	KRW
KR	Naverpay	KRW
KR	ApplePay	KRW
KR	TossPay	KRW
HK	Card Purchase	HKD
HK	Card Purchase	HKD
HK	Card Purchase	HKD
HK	Card Purchase	HKD
HK	Card Purchase	HKD
HK	QR Payment	HKD
HK	QR-POSScan	HKD
HK	QR-POSScan	HKD
HK	QR-POSScan	HKD
HK	QR-POSScan	HKD
HK	QR-POSScan	HKD
HK	QR-POSScan	HKD
HK	Octopus	HKD
HK	Alipay	HKD
HK	AlipayHK	HKD
ID, XB	VISA	IDR
ID, XB	Mastercard	IDR
ID, XB	JCB	IDR
ID, XB	AMEX	IDR
ID, XB	EMONEY_OVO_SNAP	IDR
ID, XB	EMONEY_DANA_SNAP	IDR
ID, XB	EMONEY_SHOPEEPAY_SNAP	IDR
ID, XB	VIRTUAL_ACCOUNT_BCA	IDR
ID, XB	VIRTUAL_ACCOUNT_BNI	IDR
ID, XB	VIRTUAL_ACCOUNT_BRI	IDR
ID, XB	VIRTUAL_ACCOUNT_MANDIRI	IDR
ID, XB	VIRTUAL_ACCOUNT_CIMB	IDR
ID, XB	VIRTUAL_ACCOUNT_DOKU	IDR
ID, XB	AKULAKU	IDR
ID, XB	INDODANA	IDR
ID, XB	KREDIVO	IDR
ID, XB	INDOMARET	IDR
ID, XB	ALFA_GROUP	IDR
ID, XB	Qris	IDR
ID, XB	DIRECT_DEBIT_ALLO_SNAP	IDR
ID, XB	DIRECT_DEBIT_BRI_SNAP	IDR
ID, XB	DIRECT_DEBIT_CIMB_SNAP	IDR
ID, XB	DIRECT_DEBIT_MANDIRI_SNAP	IDR
ID	Qris	IDR
SG	Card Purchase	SGD
SG	Card Purchase	SGD
SG	QR Payment / Paynow	SGD
SG	WeChat Pay	SGD
SG	ScanWalletQR, QR-POSScan, WeChat Pay-Offline	SGD
SG	Alipay+	SGD
SG	ScanWalletQR, QR-POSScan, Alipay+-Offline	SGD
SG	GrabPay(CSB)	SGD
SG	UnionPay	SGD
SG	SingTel Dash	SGD
SG	Shopeepay(CSB)	SGD
SG	VISA	SGD
SG	Mastercard	SGD
SG	DinersClub	SGD
SG	Discover	SGD
SG	American Express	SGD
SG	Paynow	SGD
SG	Shopeepay	SGD
SG	GrabPay	SGD
SG	Atome	SGD
SG	UnionPay	SGD
SG	Alipay+	SGD
SG	WeChat Pay	SGD
SG	UPI ID	SGD
SG	Mastercard	SGD
SG	VISA	SGD
SG	GooglePay	SGD
SG	ApplePay	SGD
SG	Paynow	SGD
SG	Paynow	SGD
SG	Paynow	SGD
SG	QR Payment	SGD
SG	WeChat Pay	SGD
SG	WeChat Pay	SGD
SG	Kakao Pay	SGD
SG	TNG eWallet	SGD
SG	GrabPay	SGD
SG	Boost	SGD
SG	AlipayHK	SGD
SG	Alipay	SGD
SG	DANA	SGD
SG	Rabbit LINE Pay	SGD
SG	GCash	SGD
SG	BPI	SGD
SG	TrueMoney Wallet	SGD
SG	MPay Macau	SGD
SG	Hipay	SGD
SG	TOSS	SGD
SG	Naverpay	SGD
SG	Maya	SGD
SG	Tinaba	SGD
SG	K_PLUS	SGD
SG	Billease	SGD
SG	Kredivo	SGD
JP	merPay	JPY
JP	auPay	JPY
JP	PayPay	JPY
JP	RPay	JPY
JP	docomo	JPY
JP, XB	GMO-Bank Transfer	JPY
JP	Seicomart	JPY
JP	Ministop	JPY
JP	Family Mart	JPY
JP	Lawson	JPY
JP	7-Eleven	JPY
JP, XB	JCB	JPY
JP, XB	Discover	JPY
JP, XB	American Express	JPY
JP, XB	Mastercard	JPY
JP, XB	VISA	JPY
PH	Card Purchase	PHP
PH	Card Purchase	PHP
PH	QR Payment	PHP
PH	ScanWalletQR, QR-POSScan, WeChatPay-Offline	PHP
PH	ScanWalletQR, QR-POSScan, Alipay-Offline	PHP
PH	UnionPay-Offline	PHP
PH	ScanWalletQR, QR-POSScan, GCash-Offline	PHP
PH	ScanWalletQR, QR-POSScan, GrabPay-Offline	PHP
PH	ScanWalletQR, QR-POSScan, ShopeePay-Offline	PHP
PH	ScanWalletQR, QR-POSScan, HelloMoney-Offline	PHP
PH	ScanWalletQR, QR-POSScan, Liquid Pay Xnap-Offline	PHP
PH	ScanWalletQR, QR-POSScan, Alipay+-Offline	PHP
ID		IDR
ID		IDR
ID		IDR
VN		VND
VN		VND
VN		VND
VN		VND
VN		VND
VN		VND
VN		VND
VN		VND
HK		HKD
HK		HKD
HK		HKD
HK		HKD
HK		HKD
HK		HKD
HK		HKD
HK		HKD
HK		HKD
HK		HKD
HK		HKD
HK		HKD
HK		HKD
HK		HKD`;
  const rows = raw.split('\n').map(line => { const [country,method,currency] = line.split('\t'); return {country,method,currency:currency || ''}; });
  function compileRows(source = rows) {
    if (!Array.isArray(source) || source.length > 5000) throw new Error('支付配置必须为不超过5000行的数组');
    const rules = [], issues = [], seen = new Set(); let duplicates = 0;
    source.forEach((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row) || ['country','method','currency'].some(k => typeof row[k] !== 'string' || row[k].length > 500 || /[\u0000-\u001f]/.test(row[k]))) throw new Error(`第${index+1}行结构无效，需要country/method/currency文本`);
      const country = row.country.trim(), method = row.method.trim(), currency = row.currency.trim();
      const reasons = [];
      if (!country || !method || !currency) reasons.push('国家、支付方式或币种为空，禁用');
      if (/[,/;=]/.test(method)) reasons.push('复合调用值或provider参数，需确认映射后启用');
      const countryCodes = country.split(',').map(x => x.trim());
      const supportedCountries = countryCodes.filter(c => countries.some(item => item.value === c));
      const unknownCountries = countryCodes.filter(c => c && !countries.some(item => item.value === c));
      if (unknownCountries.length) reasons.push(`未识别国家标记${unknownCountries.join(',')}不启用，仅匹配明确国家`);
      const currencyCodes = currency.split(',').map(x => x.trim());
      if (currency && currencyCodes.some(c => !Object.hasOwn(currencies,c))) reasons.push('未知币种，整行禁用');
      if (reasons.length) issues.push({row:index+1,reason:reasons.join('；')});
      if (!country || !method || !currency || /[,/;=]/.test(method) || currencyCodes.some(c => !Object.hasOwn(currencies,c))) return;
      for (const c of supportedCountries) for (const cur of currencyCodes) {
        const key = JSON.stringify([c,method,cur]);
        if (seen.has(key)) { duplicates++; continue; }
        seen.add(key); rules.push({country:c,method,currency:cur});
      }
    });
    return {rules,issues,duplicates};
  }
  function validateSelection(b, source = rows) {
    const country = b.tradeCountry, currency = b.currency, methods = b.paymentMethods;
    if (country !== undefined && (typeof country !== 'string' || !countries.some(c => c.value === country))) return 'tradeCountry 不在明确国家枚举中';
    if (currency !== undefined && (typeof currency !== 'string' || !Object.hasOwn(currencies,currency))) return 'currency 不在币种枚举中';
    if (methods !== undefined && (!Array.isArray(methods) || methods.some(m => typeof m !== 'string'))) return 'paymentMethods 必须为字符串数组';
    if (methods?.length && (!country || !currency)) return '指定支付方式时必须选择国家及币种，以严格校验组合';
    if (!country && !currency && !methods?.length) return null;
    const {rules} = compileRows(source);
    const matches = rules.filter(rule => (!country || rule.country === country) && (!currency || rule.currency === currency));
    if (!matches.length) return '国家与币种不匹配支付配置，禁止调用';
    if (methods?.some(method => !matches.some(rule => rule.method === method))) return '支付方式与国家、币种不匹配支付配置，禁止调用';
    return null;
  }
  const compiled = compileRows(rows);
  const allMethods = [...new Set(compiled.rules.map(r => r.method))];
  const methodsByCountry = Object.fromEntries(countries.map(c => [c.value,[...new Set(compiled.rules.filter(r=>r.country===c.value).map(r=>r.method))]]));
  const options = { countries, currencies, rows, compileRows, validateSelection, methodsByCountry, allMethods, unmappedMethods:[] };
  if (typeof module !== 'undefined' && module.exports) module.exports = options; else root.CheckoutOptions = options;
})(typeof window !== 'undefined' ? window : globalThis);
