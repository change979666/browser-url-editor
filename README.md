# Browser Automation Message Assistant

面向**经授权的浏览器工作流**的实验性工具，由 Chrome Manifest V3 扩展和 Windows Python 桌面程序组成。桌面端用于管理消息内容、URL 模板和 ID 列表；扩展端负责识别当前页面、读取浏览器 ID，并执行页面内导航和消息交互。

> **当前状态 / Status:** the two components are present, but their local integration is not complete. The extension requests `http://localhost:5000/config` and `/browser_status`; the current `monitor.py` does not expose those HTTP endpoints. Treat the extension/desktop bridge as work in progress rather than a verified end-to-end feature.

## 功能概览

- **消息与 URL 配置**：桌面端可配置消息正文、带 `{id}` 占位符的基础 URL，并保存配置。
- **ID 列表管理**：支持从文件加载 ID、添加 ID、清空列表和按列表推进操作。
- **Chrome 扩展**：基于 Manifest V3，内容脚本可以识别常见文本输入框和发送按钮，支持消息模板中的 `{{DATE}}`、`{{TIME}}` 变量。
- **页面状态与浏览器 ID**：扩展生成并保存浏览器 ID，可在弹出窗口查看连接状态并复制 ID。
- **运行日志**：Python 桌面程序记录运行过程，便于排查操作问题。

## 技术栈

- Browser extension: JavaScript, Chrome Extensions Manifest V3
- Desktop app: Python, PyQt5
- Python dependencies: see [requirements.txt](./requirements.txt)

## 环境要求

- Windows（桌面端使用 Windows 系统 API）
- 已安装的 Python 环境
- Chrome 或其他兼容 Manifest V3 的 Chromium 浏览器

## 安装与运行

### 1. 安装桌面端依赖

```powershell
git clone https://github.com/change979666/browser-url-editor.git
cd browser-url-editor
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python monitor.py
```

桌面端可能会请求管理员权限，因为程序包含窗口检测与前台窗口操作代码。仅在你理解并信任源码的环境中运行。

### 2. 加载浏览器扩展

1. 打开浏览器扩展管理页（Chrome 可访问 `chrome://extensions`）。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展程序”，选中仓库目录。
4. 在你有权管理的测试页面验证扩展状态及交互。

## 配置文件与日志

- `config.json`：桌面端保存的消息和 URL 配置（运行时生成）。
- `monitor.log`：桌面端日志（运行时生成）。
- 扩展使用本地存储保存浏览器 ID；页面交互取决于目标网页结构和权限。

请不要将真实客户数据、私密 ID、会话链接或其他敏感信息提交到仓库。

## 已知限制

- **本地通信桥尚未打通**：扩展调用 `localhost:5000` 的配置和状态接口，但当前桌面端未实现对应 HTTP 服务。需补齐本地 API 或调整通信协议后，才能验证完整联动流程。
- 网页输入框和发送按钮的识别依赖具体页面 DOM，站点更新后可能需要维护选择器。
- 扩展声明了较广的站点访问权限；建议仅在授权环境中安装和测试，并在后续版本中收紧权限范围。

## 使用边界

仅用于你拥有权限、已获授权且符合目标平台规则的工作流。不要用于未经同意的批量消息发送、骚扰、垃圾信息或规避平台安全机制。

## License

MIT License. See [LICENSE](./LICENSE).
