# 鱼灾屏蔽助手

[简体中文](README.md) | [English](README.en.md)

一款支持 Chrome、Microsoft Edge 和 macOS Safari 的扩展，用于在 Bilibili 视频/番剧和小黑盒帖子页面本地隐藏低等级或命中自定义关键词的评论/回复。

> 过滤只影响你自己的页面显示，不会删除评论、屏蔽账号、提交举报或修改 B 站数据。

## Contributors（贡献者）

- [Pane-Peter](https://github.com/Pane-Peter)（项目维护者）
- OpenAI Codex（AI 协助代码实现、调试与文档编写）

## 功能

- 隐藏可识别等级低于 3 级的评论和回复。
- 检查评论用户名、正文和组件显示文本，命中任一关键词时隐藏对应评论/回复。
- 在扩展弹窗中分别启停总过滤、B 站等级规则、小黑盒无等级规则和关键词规则。
- 在弹窗中编辑关键词，支持中文逗号、英文逗号和换行分隔。
- 适配 B 站新版 Shadow DOM 评论组件，并兼容部分旧版评论区结构。
- 适配小黑盒帖子评论及回复；可单独开启“隐藏小黑盒无等级标识评论”，没有 LV 等级标识的评论/回复会被隐藏，带有 LV8 等标识的仍会显示。
- 页面右下角显示运行状态、检查数量和隐藏数量。
- 关键词及开关设置通过浏览器扩展存储保存；Safari 中不会跨设备同步。

## 默认过滤规则

默认开启以下过滤：

1. **B 站等级过滤：** 隐藏能识别且等级小于 3 的 B 站评论。无法识别等级时，不会仅因为等级缺失而隐藏。
2. **小黑盒无等级过滤：** 默认开启。隐藏没有等级标识的评论或回复；识别到 `LV8` 等等级标识或“作者”标识时保留。可以在弹窗单独关闭此规则。
3. **关键词过滤：** B 站和小黑盒的评论用户名或内容包含任一默认关键词时隐藏。

默认关键词如下：

```text
本鱼、本肥鱼、肥鱼、大肥鱼、小肥鱼、肥肥鱼、鱼鱼、鱼鱼我呀、鱼宝、鱼宝贝、小鱼、小鲸鱼、鲸鱼、本鲸、鱼主人、鲸鱼主人、主人、主人大人、我的主人、本鱼觉得、本鱼认为、本鱼表示、本鱼来啦、鱼鱼来啦、DeepSeek、Deep Seek、深度求索、DeepSeek-R1、DeepSeek-V3
```

关键词采用不区分英文大小写的“包含匹配”。例如设置“鲸鱼”，评论用户名或正文中只要包含“鲸鱼”就会命中。较宽泛的词（如“主人”“小鱼”）可能过滤正常评论，可在弹窗中删除或替换。

## 安装和使用

### 方式一：加载本地源码（开发者模式）

1. 从 GitHub 下载项目 ZIP 并解压，或使用 Git 克隆仓库。
2. 在 Chrome 地址栏打开 `chrome://extensions`。
3. 打开右上角的**开发者模式**。
4. 点击**加载已解压的扩展程序**。
5. 选择解压后的项目根目录，也就是包含 `manifest.json` 的文件夹。
6. 打开或刷新 Bilibili 视频/番剧页面，或小黑盒帖子页面（例如 `/app/bbs/link/194148558`）。首次访问小黑盒页面时，Chrome 可能会要求允许扩展访问 `www.xiaoheihe.cn`。

### Microsoft Edge

Edge 使用与 Chrome 相同的扩展源码，无需单独修改过滤代码：

1. 在 Edge 地址栏打开 `edge://extensions`。
2. 打开**开发人员模式**。
3. 点击**加载解压缩的扩展**，选择包含 `manifest.json` 的项目文件夹。
4. 打开或刷新 Bilibili 或小黑盒帖子页面；如果 Edge 询问网站访问权限，请允许扩展访问对应站点。

Microsoft 说明 Edge 可直接使用兼容的 Chrome 扩展 API；本项目使用的 `storage` 与内容脚本 API 可沿用同一份源码。参见[Edge 官方移植说明](https://learn.microsoft.com/microsoft-edge/extensions/developer-guide/port-chrome-extension)和[本地加载说明](https://learn.microsoft.com/microsoft-edge/extensions-chromium/getting-started/extension-sideloading)。

### Safari（macOS）

Safari 15.4 及以上支持 Manifest V3。本项目使用的 `chrome.*` 扩展 API 在 Safari Web Extension 中可用；Safari 的 `storage.sync` 不提供跨设备同步，设置保存在本机。[Apple 兼容性说明](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility)

开发时可临时加载源码文件夹：在 Safari 设置的“高级”中启用网页开发者功能，然后进入“开发者”设置，选择**添加临时扩展**并选中项目文件夹。Safari 可能要求先允许未签名扩展。临时扩展会在退出 Safari 或 24 小时后移除。[Apple 临时安装说明](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)

如需生成可由 Safari app 安装的版本，需要在 Mac 上使用 Xcode 的 Safari Web Extension Packager：

```sh
xcrun safari-web-extension-packager /path/to/fatfish-disaster-blocker \
  --project-location /path/to/FishDisasterBlockerSafari \
  --app-name "Fish Disaster Blocker" --swift --copy-resources
```

随后在 Xcode 中构建并运行生成的 macOS app，再到 Safari 设置中启用扩展。[Apple 打包说明](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)。该步骤需要 macOS 和 Xcode；Windows 下无法生成 Safari app。

### 方式二：从本地 CRX 安装（按系统区分）

`.crx` 是 Chrome 的打包扩展格式。能否直接从本地安装取决于操作系统和浏览器管理策略：

- **Windows/macOS 个人版 Chrome：** 不支持直接安装本地 `.crx` 文件。请使用上面的“加载已解压的扩展程序”方式；日常分发则需要先发布到 Chrome Web Store，再从商店页面点击**添加至 Chrome**。
- **Linux：** Chrome 支持管理员通过外部扩展配置安装本地 `.crx`，步骤如下：
  1. 打包扩展为 `.crx`，记下扩展 ID 和 `manifest.json` 中的版本号。
  2. 将 `.crx` 放到固定路径，例如 `/opt/google/chrome/extensions/fish-disaster-blocker.crx`。
  3. 以管理员权限，在 `/opt/google/chrome/extensions/`（或 `/usr/share/google-chrome/extensions/`）新建名为 `<扩展ID>.json` 的文件，内容如下，并将路径、版本号替换成实际值：

     ```json
     {
       "external_crx": "/opt/google/chrome/extensions/fish-disaster-blocker.crx",
       "external_version": "2.3.1"
     }
     ```

  4. 重启 Chrome，在 `chrome://extensions` 确认扩展已安装。

  这种方式需要系统管理员权限；`.json` 文件名中的扩展 ID 必须与 `.crx` 包中的 ID 一致。详见 [Chrome 官方 Linux 本地扩展安装说明](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux)。
- **受企业策略管理的设备：** 请联系管理员通过 Chrome 企业策略部署扩展。

如果你在 Windows 上拿到的是 `.crx`，可将其解压为扩展目录，再回到 `chrome://extensions` 使用开发者模式的**加载已解压的扩展程序**。GitHub Release 的 ZIP 也需要先解压，不能直接导入 Chrome。Chrome 的安装限制详见[官方分发说明](https://developer.chrome.com/docs/extensions/how-to/distribute)。

### 设置过滤规则

点击 Chrome 工具栏中的**鱼灾屏蔽助手**图标：

- **启用过滤：** 暂停或恢复所有过滤。
- **隐藏等级低于 3 级：** 单独控制 B 站等级过滤。
- **隐藏小黑盒无等级标识评论：** 单独控制小黑盒无等级过滤；没有等级标识时隐藏，识别到 `LV8` 或“作者”标识时保留。
- **匹配评论/回复内容和用户名：** 单独控制关键词过滤；同时适用于 B 站和小黑盒。
- **关键词：** 修改需要匹配的词，多个词用逗号或换行分隔。输入后自动保存。

如刚安装后工具栏没有显示图标，可点扩展程序拼图按钮并将扩展固定到工具栏。

## 更新扩展

### 从源码更新

1. 下载新版源码并放在原来的扩展目录（或重新选择新版目录）。
2. 打开 `chrome://extensions`。
3. 在“鱼灾屏蔽助手”卡片上点击重新加载按钮。
4. 刷新已打开的 Bilibili 或小黑盒帖子页面；若 Chrome 提示新增网站访问权限，请允许访问小黑盒。

升级时扩展会把新版默认关键词并入已有关键词一次，并保留此前自定义的词。之后你在弹窗删掉的词不会在每次启动时自动加回来。

## 本地开发

本扩展使用 Manifest V3，没有构建步骤和第三方运行时依赖。修改 `content.js`、`content.css` 或弹窗文件后，在当前浏览器的扩展管理页重新加载扩展，再刷新 Bilibili 或小黑盒页面。Safari 需按上文用 Xcode 重建 macOS app。

目录结构：

```text
manifest.json       扩展清单、权限、页面匹配规则和图标声明
content.js          评论扫描、等级/关键词判断、动态更新处理
content.css         隐藏样式和页面状态提示
popup.html          工具栏弹窗结构
popup.js            设置加载、关键词编辑和自动保存
popup.css           弹窗样式
icons/              16、32、48、128 像素扩展图标
dist/               可下载的 ZIP 发布包
LICENSE             MIT License
```

## 常见问题

**B 站评论没有被过滤？**

- 确认扩展已启用，且弹窗中的对应过滤规则已勾选。
- 更新扩展后，在 `chrome://extensions` 重新加载，再刷新 Bilibili 页面。
- 检查页面右下角状态提示。扩展只处理它能识别的评论组件；B 站页面结构改变时可能需要更新适配。
- 等级信息识别不到时，不会按等级规则隐藏；可以使用关键词规则补充过滤。

**小黑盒评论没有被过滤？**

- 确认 Chrome 已允许扩展访问 `www.xiaoheihe.cn`，并重新加载扩展、刷新帖子页面。
- 小黑盒可使用关键词规则，也可通过弹窗开关隐藏没有等级标识的评论；带有 `LV8` 或“作者”标识的评论会保留。
- 当前适配小黑盒帖子评论列表中的主评论和回复；如果小黑盒更改页面结构，可能需要更新适配。

**正常评论也被隐藏了？**

从弹窗删除过于宽泛的关键词，或关闭关键词规则。关键词只需从用户名或正文中任一处匹配就会隐藏。

**如何确认设置已经保存？**

在弹窗修改选项或关键词后会自动保存；弹窗状态区域会短暂显示“已保存”。

## 权限与隐私

- `storage`：保存过滤开关和关键词。
- `https://www.bilibili.com/*`：在匹配的 Bilibili 视频/番剧页面运行内容脚本。
- `https://www.xiaoheihe.cn/*`：在小黑盒帖子页面运行评论关键词过滤。
- 过滤在浏览器本地执行。扩展代码不会将评论、用户名或设置发送到外部服务器。

## 许可证

本项目采用 [MIT License](LICENSE)。
