# 小窗观察站 · WebUSB ADB

电脑端原生 HTML / CSS / JavaScript，无 Vue、无后端。通过浏览器 WebUSB 与手机 adbd 通信。使用 Tango 的 `@yume-chan/adb`、`adb-daemon-webusb` 和 `adb-credential-web`（MIT）；Vite 仅用于开发与打包，不是 UI 框架。

## 在电脑运行

需要 Node.js 18+（建议 22 LTS）：

```sh
cd tools/window-diagnostics
npm ci
npm run dev
```

电脑 Chrome / Edge 独立标签访问 `http://localhost:5173`。必须是 HTTPS 或本机 localhost 安全上下文，不要用 `file://`、普通 HTTP 局域网 IP 或嵌入式预览。手机通过 USB **连接运行浏览器的电脑**，不是连接开发服务器。

生产部署：`npm run build` 后将 `dist/` 发布到可信 HTTPS 静态服务器；也可用 `python -m http.server 8080 --directory dist --bind 127.0.0.1`，打开 `http://localhost:8080`。所有脚本本地打包，无 CDN 或遥测，不需要服务端 ADB。

## 一轮推荐流程

1. 手机开启开发者选项和 USB 调试，解锁屏幕，连接 USB 数据线。
2. 点连接并在手机确认授权。接口占用时关闭其他 WebADB 页面，必要时电脑执行 `adb kill-server`。Windows 需要兼容的 ADB / WinUSB 驱动；Linux 可能需要 udev 配置。
3. 填米窗具体 release、应用包名、运行模式、键盘和窗口条件。
4. 点开始新一轮。包含 logcat 原有缓冲区，不清日志，不过滤包名，以免丢失 system_server 证据。
5. 可先采集设备与应用版本。手机开小窗、单击复现；异常时点「标记异常 + 状态快照」。不要连续猛点。
6. ANR 出现后再等约 30 秒；读取 DropBox ANR，停止并导出 JSON。TXT 只有 logcat；JSON 包含标记、命令输出、退出码和错误。
7. 换上游版，在相同设备 / 应用 / 输入法 / 运行模式 / 窗口尺寸下重复。采用上游→当前→当前→上游顺序，记录失败次数 / 总次数。不要同时运行两个米窗实现。

## 限制与隐私

- 只运行界面可审查的固定只读命令；唯一动态参数是经过白名单校验的 Android 包名。不安装应用、不清日志、不改设置。命令本身及抓取也有开销，尤其 DropBox 与 dumpsys，可能影响时序。
- ADB shell 仍受 Android 权限约束。DropBox 可能拒绝或只含部分报告。不会绕过 `/data/anr` 限制；需要完整报告时使用手机开发者选项的错误报告。
- 报告打印时间不等于 ANR 触发时间；关键词命中不是根因分析。快照按顺序采集，非原子快照；日期命令用于对照电脑 / 手机时钟。数据里保存每条命令开始 / 完成时间。
- logcat 最多保留 8 百万字符（滚动丢弃，并显示丢弃数）；界面只处理最近 20 万字符中的最后 120 条匹配行。过滤不影响导出。stderr 最多保留 64,000 字符。
- 每条快照命令限时 45 秒，stdout 与 stderr 合计保留前 4 百万字符，截断后仍排空流避免堵塞 ADB。每轮最多保留 24 个结果，淘汰数量在页面及 JSON 中可见。
- 日志仅在当前页面内存，不上传、不自动持久化；刷新会丢失。导出前自行检查隐私。ADB RSA 私钥由凭据库保存在浏览器站点存储中；只在可信电脑使用，用后在手机撤销 USB 调试授权，必要时清理浏览器站点数据。
- 此工具不能凭“上游出现少”直接定位回归。需要明确上游仓库 / release、同条件日志和线程栈后比较代码。

## 验证

`npm test` 测试内存截断、包名注入防护、线索提示与命令白名单；`npm run build` 验证依赖及生产构建。

尚未在实际 USB 手机上验证授权、logcat、设备拔插与厂商 DropBox 权限。浏览器预览不代表真实 USB 链路已通过。Android 工程未因本工具改动，也不需要 Gradle。

## 已编译的电脑运行包

无法使用 Arena 下载入口时，打开本目录下的
[`downloads/freeform-usb-lab-local.zip`](downloads/freeform-usb-lab-local.zip)，
在 GitHub 文件页点 **Download raw file** 下载（不是下载整个仓库）。
完整解压后 Windows 双击 `start-windows.cmd`；macOS / Linux 执行
`python3 start_local.py`。需要 Python 3，不需要 Node.js 或重新编译。
在电脑 Chrome / Edge 打开启动窗口打印的 localhost 地址。
