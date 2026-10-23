# Fish Disaster Blocker

[简体中文](README.md) | [English](README.en.md)

A Chrome extension that locally hides low-level Bilibili comments and filters comments or replies on Bilibili and Xiaoheihe when their usernames or text contain selected keywords.

> Filtering only changes what is displayed in your browser. It does not delete comments, block accounts, submit reports, or modify Bilibili data.

## Contributors

- [Pane-Peter](https://github.com/Pane-Peter) — project maintainer
- OpenAI Codex — AI-assisted implementation, debugging, and documentation

[View the GitHub contributors graph](https://github.com/Pane-Peter/fatfish-disaster-blocker/graphs/contributors)

## Features

- Hide Bilibili comments and replies whose recognized user level is below level 3.
- Match keywords against usernames and comment text, then hide the matching item.
- Toggle all filtering, level filtering, and keyword filtering separately in the extension popup.
- Edit the keyword list in the popup. Separate terms with commas or new lines.
- Support Bilibili's newer Shadow DOM comment components and some legacy comment layouts.
- Support comments and replies on Xiaoheihe post pages. A separate toggle hides items with no level badge; comments with a badge such as `LV8` remain visible.
- Show filtering status, number of checked comments, and number hidden in a page indicator.
- Save settings using Chrome Sync Storage.

## Default filters

Filters are enabled by default:

1. **Bilibili level filter:** hides comments with a recognized user level below 3. A comment is not hidden by this rule when its level cannot be identified.
2. **Xiaoheihe no-level filter:** enabled by default. Hides comments or replies with no level badge. Items with badges such as `LV8` remain visible. Toggle this rule separately in the popup.
3. **Keyword filter:** hides a comment on Bilibili or Xiaoheihe when its username or text contains any configured keyword.

Default keywords:

```text
本鱼, 本肥鱼, 肥鱼, 大肥鱼, 小肥鱼, 肥肥鱼, 鱼鱼, 鱼鱼我呀, 鱼宝, 鱼宝贝, 小鱼, 小鲸鱼, 鲸鱼, 本鲸, 鱼主人, 鲸鱼主人, 主人, 主人大人, 我的主人, 本鱼觉得, 本鱼认为, 本鱼表示, 本鱼来啦, 鱼鱼来啦, DeepSeek, Deep Seek, 深度求索, DeepSeek-R1, DeepSeek-V3
```

Matching uses substring comparison and ignores English letter case. For example, the keyword `鲸鱼` matches any username or comment text that contains those characters. Broad terms such as `主人` or `小鱼` may also match ordinary comments; remove or replace them in the popup if needed.

## Install and use

### Option 1: Load the source folder (developer mode)

1. Download and extract the repository ZIP, or clone this repository with Git.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the project root folder that contains `manifest.json`.
6. Open or refresh a Bilibili video/anime page or a Xiaoheihe post page such as `/app/bbs/link/194148558`. Chrome may ask you to allow access to `www.xiaoheihe.cn` the first time.

### Option 2: Install a local CRX package (platform-dependent)

`.crx` is Chrome's packed extension format. Whether Chrome can install a local CRX depends on the operating system and management policy:

- **Personal Chrome on Windows or macOS:** Chrome does not allow direct installation of a local `.crx` file. Use **Load unpacked** above, or publish the extension to the Chrome Web Store and install it from its listing.
- **Linux:** Chrome supports installing a local `.crx` through an administrator-managed external extension configuration:
  1. Pack the extension as a `.crx`, and note its extension ID and the version in `manifest.json`.
  2. Put the `.crx` at a fixed path, for example `/opt/google/chrome/extensions/fish-disaster-blocker.crx`.
  3. As an administrator, create a file named `<extension-id>.json` in `/opt/google/chrome/extensions/` or `/usr/share/google-chrome/extensions/`. Replace the path and version with the actual values:

     ```json
     {
       "external_crx": "/opt/google/chrome/extensions/fish-disaster-blocker.crx",
       "external_version": "2.3.0"
     }
     ```

  4. Restart Chrome and verify the extension at `chrome://extensions`.

  This requires administrator access, and the ID in the JSON filename must match the ID in the CRX package. See [Chrome's official Linux installation guide](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux).
- **Enterprise-managed devices:** Ask the administrator to deploy the extension through Chrome enterprise policies.

GitHub Release ZIP files cannot be imported directly into Chrome. On Windows, a `.crx` can be extracted and its resulting extension folder loaded with **Load unpacked**. See [Chrome's distribution documentation](https://developer.chrome.com/docs/extensions/how-to/distribute).

### Configure filtering

Select the **Fish Disaster Blocker** toolbar icon to open the popup:

- **Enable filtering:** pause or resume all filtering.
- **Hide levels below 3:** toggle the Bilibili level rule.
- **Hide Xiaoheihe comments without a level badge:** toggle the Xiaoheihe no-level rule. Items with a badge such as `LV8` remain visible.
- **Match comment/reply text and usernames:** toggle keyword filtering on Bilibili and Xiaoheihe.
- **Keywords:** edit the terms to match. Changes are saved automatically.

If the icon is not visible in the toolbar, pin it from Chrome's Extensions menu.

## Update

For a source installation, replace or update the extension folder, open `chrome://extensions`, select the extension's reload button, and refresh Bilibili or Xiaoheihe pages. Allow access to Xiaoheihe if Chrome prompts for the newly added site permission.

On the first update after a default-keyword list change, new defaults are merged into existing terms once. Existing custom terms are preserved; terms removed later in the popup are not re-added on every startup.

## Development and deployment

This is a Chrome Manifest V3 extension with no build step or third-party runtime dependencies. After editing `content.js`, `content.css`, or popup files, reload the extension at `chrome://extensions` and refresh the Bilibili or Xiaoheihe page.

For general users on Windows and macOS, the supported distribution path is the Chrome Web Store: upload the extension package through the Chrome Web Store Developer Dashboard, complete review, and install it from its store listing. See [Chrome's distribution guide](https://developer.chrome.com/docs/extensions/how-to/distribute). Local `.crx` installation is limited to Linux or enterprise-managed environments as described above.

Project layout:

```text
manifest.json       Extension manifest, permissions, URL matches, and icons
content.js          Comment scanning and filtering logic
content.css         Hide rules and on-page status indicator
popup.html          Toolbar popup markup
popup.js            Settings and keyword editing/saving
popup.css           Popup styles
icons/              16, 32, 48, and 128 px extension icons
dist/               Downloadable ZIP package
LICENSE             MIT License
```

## Troubleshooting

**A Bilibili comment was not filtered**

- Confirm that the extension and the relevant rule are enabled in the popup.
- After updating, reload the extension at `chrome://extensions` and refresh the Bilibili page.
- Check the status indicator. The extension can only process comment components it recognizes; Bilibili layout changes may require an adapter update.
- When a user's level cannot be identified, the level rule will not hide that comment. Add a keyword if you want to filter it by text instead.

**A Xiaoheihe comment was not filtered**

- Confirm Chrome allows the extension to access `www.xiaoheihe.cn`, then reload the extension and refresh the post page.
- Xiaoheihe uses keyword filtering and the optional no-level rule. When the rule is enabled, comments without a recognized LV badge are hidden.
- The adapter covers top-level comments and replies in the post comment list. A Xiaoheihe layout change may require an adapter update.

**A normal comment was hidden**

Remove broad keywords from the popup or disable keyword filtering. A match in either the username or the comment text is enough to hide the item.

## Permissions and privacy

- `storage`: saves filter toggles and keywords.
- `https://www.bilibili.com/*`: allows the content script to run on matching Bilibili pages.
- `https://www.xiaoheihe.cn/*`: allows keyword filtering on Xiaoheihe post pages.
- Filtering runs locally in the browser. The extension does not send comments, usernames, or settings to an external server.

## License

This project is licensed under the [MIT License](LICENSE).
