# 发布记录

## v2.0.0 · 2026-11-26

- GitHub Pages 提供 Windows x64 安装程序、Apple 芯片和 Intel Mac 磁盘映像（macOS 13 起）。工作台自带运行时，首次安装并打开后默认随用户登录启动，可从菜单栏或系统托盘切换。已运行的工作台可在同一页面全窗口使用。[下载入口](https://mylys.github.io/checkout-offline-demo/)
- 移除模拟下单入口。每个工作台进程以空的生产和沙箱商户列表启动。用户手工导入 Excel 后可切换商户，下单前核对商户、金额与币种，由本机签名并发往所选网关。退出进程后清空签名密钥，浏览器刷新保留本次选择。本地保留订单与日志摘要。
- 257 项自动化测试通过，使用本机测试网关验证第 127 个合成商户签名。Apple 芯片 Mac 实测从 DMG 安装、桌面启动、Chrome 导入 127 行、切换并刷新、重启后两个环境恢复为空。Intel Mac 包已挂载校验，Windows 包已解包校验 x64 可执行文件。Windows 和 Intel Mac 真机安装、跨系统登录自启、生产支付与公网异步通知待验证。本版本未使用 Apple Developer ID 公证或 Windows Authenticode 签名。
- 安装包位于 [GitHub Release v2.0.0](https://github.com/mylys/checkout-offline-demo/releases/tag/v2.0.0)。Pages 由公开仓库 main 根目录发布，部署结果见 [GitHub Pages 部署记录](https://github.com/mylys/checkout-offline-demo/deployments/github-pages)。

| 安装包 | SHA-256 |
| --- | --- |
| Checkout-2.0.0-windows-x64.exe | `d85169dfc1d8073cca5d6796aa80990efbadc3dfe4e4ecd1860fc17b85054d53` |
| Checkout-2.0.0-mac-arm64.dmg | `b219106302f379968cace77126ba0bf0fd1fdcc63a16d001c8c93d2eea883037` |
| Checkout-2.0.0-mac-x64.dmg | `ef11bda0b0ff2d4d2c3f966294e1598b5512f240251d52076cfbaa176481e3d5` |

## Pages v1.3.1 · 2026-11-26

- 修复首次访问首页时全窗口等待本机服务的问题。访客可直接使用浏览器内的离线演示和模拟下单。已获本地网络权限的浏览器在后台连接 18791，收到本机就绪通知后才全窗口展示；操作演示时停止自动切换。
- 点击「本地联调」即可查看运行包下载、Mac 与 Windows 启动步骤、连接按钮，或返回演示。已有联调工作区继续支持同页重连和独立窗口。
- 发布目标与产物为 [GitHub Pages 首页](https://mylys.github.io/checkout-offline-demo/) 及其静态资源，由 main 发布。[部署状态](https://github.com/mylys/checkout-offline-demo/deployments/github-pages)。配套运行包为 v1.2.0。
- macOS Chrome 已验证首次访问（本地网络权限待询问、服务不可达）可直接模拟下单，并确认该流程零回环请求、零网络 POST。已验证授权后服务在线时全窗口加载、服务离线时继续演示、手动及自动重连和手机视口。其他浏览器真机及收件人的电脑待验证。

## Pages v1.3.0 · 2026-11-26

- 打开项目首页即在当前标签页连接本机 18791。连接成功后，联调工作区占满浏览器内容区，并随窗口尺寸及手机方向调整。右下角「联调选项」可返回离线演示或打开独立窗口。
- 本机尚未就绪时，页面提供运行包下载和手动重连，在页面可见时自动重试。退出工作区后停止重试。
- 变更仅涉及 Pages 入口与静态资源。配套本地运行包仍为 v1.2.0。部署入口为 [GitHub Pages 首页](https://mylys.github.io/checkout-offline-demo/)，由 main 根目录发布。[部署状态](https://github.com/mylys/checkout-offline-demo/deployments/github-pages)。
- 已使用 macOS Chrome 实测自动内嵌、刷新、退出与重新进入、服务不可达后的自动和手动重连。已校验桌面 1440×900 以及手机视口 390×844、844×390 的工作区边界。其他浏览器的真机权限提示待验证。

## v1.2.0 · 2026-11-26

- 本地联调支持同时或分次合并多个商户 Excel。支付会话可按当前环境选择交易商户，显示商户数，刷新后保留选择，生产二次确认显示商户。需要全量恢复时可在商户设置选择按单份备份的规则恢复。
- 新安装的本地工作区在沙箱和生产环境均为 0 个商户。现有安装沿用本机数据目录。下载包只分发程序和依赖。
- 生产成功、取消回跳默认打开本站的 HTTPS [回跳页](return.html)，可改用商户自己的 HTTPS 地址。异步通知默认留空，需要时填写商户可接收通知的公网 HTTPS 地址。
- 本机 18791 已升级。公开站通过 main 根目录部署到 GitHub Pages，下载产物为 [checkout-local-v1.2.0.zip](downloads/checkout-local-v1.2.0.zip)，SHA-256 为 `4961ae1f5a654c1a289478ae4d2ccc9acdb88aaeddb2642f4b907ce5968b17d2`。[Pages 部署记录](https://github.com/mylys/checkout-offline-demo/deployments/github-pages)。
- 256 项测试通过，含选中第 127 个合成商户向本机测试网关发送并验证签名。macOS Chrome 从发布包验证多文件与连续导入、切换商户和环境、刷新恢复、生产 HTTPS 回跳字段、确认框取消和手机宽度。真实支付及异步通知投递、Windows 和 Linux 启动待验证。

## v1.1.0 · 2026-11-25

- GitHub Pages 首页保留四种模式及桌面、手机布局。新增本地运行包下载、浏览器内加载和独立窗口入口。离线演示支持环境切换、合成资料联动、模拟下单及同标签页订单刷新。
- 本地运行包包含 8791 应用和锁定的生产依赖，默认监听 127.0.0.1:18791。Excel 多商户选择、组包签名、预下单、查单、退款以及 SDK 会话由本机服务处理。macOS 和 Linux 在缺少 Node.js 时下载并校验官方运行时，Windows 使用已安装的 Node.js 22 或更高版本。
- 构建产物为 downloads/checkout-local-v1.1.0.zip，SHA-256 为 7918ba6f37e3074bd14b0174995aafd33b758b193199cbeef218e000c63b41e4。部署在本仓库 main 根目录的 GitHub Pages。已从公网首页加载本机联调台，验证内嵌生产确认与取消。
- 252 项自动化测试通过。Chrome 桌面视口和 390 像素手机视口已验证页面内加载本机应用。使用 127 条合成凭据导入并选择第 127 个商户。以本机 HTTP 测试网关验证生产确认、签名、组包和响应验签。已核对 ZIP 完整性和实际凭据排除情况。
- 待验证项目为用户导入实际凭据后的真实支付和回调、钱包真机流程，以及 Windows/Linux 启动。浏览器限制访问回环地址时，可使用独立窗口。

## 2026-11-25 · 初始离线演示

提交 ad9e635 将 8791 的界面同步到纯浏览器演示站。
