(() => {
  "use strict";

  // Bilibili-only filter. Xiaoheihe uses its own independent content script.
  const DEFAULTS = {
    enabled: true,
    lowLevel: true,
    keywords: true,
    terms: [
      "本鱼", "本肥鱼", "肥鱼", "大肥鱼", "小肥鱼", "肥肥鱼",
      "鱼鱼", "鱼鱼我呀", "鱼宝", "鱼宝贝", "小鱼", "小鲸鱼", "鲸鱼", "本鲸",
      "鱼主人", "鲸鱼主人", "主人", "主人大人", "我的主人",
      "本鱼觉得", "本鱼认为", "本鱼表示", "本鱼来啦", "鱼鱼来啦",
      "DeepSeek", "Deep Seek", "深度求索", "DeepSeek-R1", "DeepSeek-V3",
    ],
  };
  const COMMENT_RENDERERS = "bili-comment-thread-renderer, bili-comment-reply-renderer";
  const SHADOW_HOSTS = "bili-comments, bili-comment-thread-renderer, bili-comment-renderer, bili-comment-reply-renderer, bili-comment-replies-renderer, bili-comment-user-info, bili-rich-text";
  const LEGACY_CARDS = ".reply-item, .root-reply-container, .sub-reply-item, .reply-item-wrap, .root-reply, .sub-reply";
  const LEGACY_BODY = ".reply-content, .reply-content-container, .content-wrp, .text-con, .reply-con";
  const LEVEL_BADGES = "[class*='level'], [class*='等级'], [aria-label*='LV'], [title*='LV']";
  const TERMS_VERSION = 2;

  const observedRoots = new WeakSet();
  const originalDisplays = new WeakMap();
  let settings = { ...DEFAULTS };
  let observer;
  let queued = new Set();
  let flushTimer = 0;
  let statusNode;

  const isElement = node => node?.nodeType === Node.ELEMENT_NODE;
  const terms = () => (Array.isArray(settings.terms) ? settings.terms : DEFAULTS.terms)
    .map(term => String(term).trim()).filter(Boolean);

  function textOf(node) {
    return (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function deepText(root) {
    const chunks = [];
    const visit = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.nodeValue) chunks.push(node.nodeValue);
        return;
      }
      if (node.shadowRoot) visit(node.shadowRoot);
      for (const child of node.childNodes || []) visit(child);
    };
    if (root) visit(root);
    return chunks.join(" ").replace(/\s+/g, " ").trim();
  }

  function findRenderer(node) {
    let element = isElement(node) ? node : node?.parentElement;
    while (element) {
      if (element.matches?.(COMMENT_RENDERERS)) return element;
      if (element.parentElement) element = element.parentElement;
      else element = element.getRootNode?.().host || null;
    }
    return null;
  }

  function findLegacyCard(node) {
    const element = isElement(node) ? node : node?.parentElement;
    return element?.matches(LEGACY_CARDS) ? element : element?.closest?.(LEGACY_CARDS) || null;
  }

  function rendererShadow(renderer) {
    return renderer?.shadowRoot || null;
  }

  // The thread's own comment is #comment; its replies live beside it. For a
  // reply, the reply renderer itself owns the user info and body.
  function ownCommentHost(renderer) {
    const shadow = rendererShadow(renderer);
    if (!shadow) return null;
    return renderer.matches("bili-comment-thread-renderer")
      ? shadow.querySelector("#comment") : renderer;
  }

  function ownUserInfo(renderer) {
    return ownCommentHost(renderer)?.shadowRoot?.querySelector("bili-comment-user-info") || null;
  }

  function parseBiliLevelSource(value) {
    if (!value) return null;
    const normalized = String(value).replace(/\\/g, "/");
    const match = normalized.match(/level[_-](h|[0-6])(?:\.svg|\b)/i);
    if (!match) return null;
    return match[1].toLowerCase() === "h" ? 7 : Number(match[1]);
  }

  function levelFromUserInfo(userInfo) {
    const root = userInfo?.shadowRoot;
    if (!root) return null;
    const info = root.querySelector("#info") || root;
    const badge = info.querySelector("#user-level");
    if (!badge) return null;

    // Current Bilibili comments render the level as an SVG image such as
    // level_3.svg. Check every URL form used by lazy-loaded images.
    for (const image of badge.querySelectorAll("img, image")) {
      for (const value of [image.currentSrc, image.getAttribute("src"), image.getAttribute("data-src"), image.getAttribute("href"), image.getAttribute("xlink:href")]) {
        const level = parseBiliLevelSource(value);
        if (level !== null) return level;
      }
    }

    // Fallback for older Bilibili markup that displays a text or class badge.
    const candidates = [badge, ...badge.querySelectorAll("*")];
    for (const element of candidates) {
      const raw = [textOf(element), element.getAttribute?.("aria-label"), element.getAttribute?.("title"), element.getAttribute?.("class")]
        .filter(Boolean).join(" ");
      const match = raw.match(/(?:等级|level|lv\.?)[^0-9]{0,8}(\d{1,2})/i)
        || raw.match(/\b(\d)\s*级\b/i)
        || raw.match(/(?:level|lv)[-_]?(\d)/i);
      if (match && Number(match[1]) <= 7) return Number(match[1]);
    }
    return null;
  }

  function rendererLevel(renderer) {
    const direct = levelFromUserInfo(ownUserInfo(renderer));
    if (direct !== null) return direct;

    // Alternate versions sometimes place #user-level directly in the renderer
    // shadow root. Search only this renderer's own root, never its child replies.
    const userInfo = ownCommentHost(renderer)?.shadowRoot?.querySelector("bili-comment-user-info");
    return levelFromUserInfo(userInfo);
  }

  function rendererMatches(renderer) {
    const userInfo = ownUserInfo(renderer);
    const username = userInfo?.shadowRoot?.querySelector("#user-name");
    const commentHost = ownCommentHost(renderer);
    const searchable = `${textOf(username)} ${deepText(commentHost?.shadowRoot || renderer)}`.toLocaleLowerCase();
    return settings.keywords && terms().some(term => searchable.includes(term.toLocaleLowerCase()));
  }

  function applyRenderer(renderer, reason) {
    if (!originalDisplays.has(renderer)) {
      originalDisplays.set(renderer, {
        value: renderer.style.getPropertyValue("display"),
        priority: renderer.style.getPropertyPriority("display"),
      });
    }
    renderer.dataset.biliCommentFilterReason = reason;
    renderer.style.setProperty("display", "none", "important");
  }

  function restoreRenderer(renderer) {
    const original = originalDisplays.get(renderer);
    if (original) {
      if (original.value) renderer.style.setProperty("display", original.value, original.priority);
      else renderer.style.removeProperty("display");
      originalDisplays.delete(renderer);
    }
    delete renderer.dataset.biliCommentFilterReason;
  }

  function processRenderer(renderer) {
    let reason = "";
    if (settings.enabled && settings.keywords && rendererMatches(renderer)) reason = "keyword";
    if (!reason && settings.enabled && settings.lowLevel) {
      const level = rendererLevel(renderer);
      if (level !== null && level < 3) reason = "level";
    }
    if (reason) applyRenderer(renderer, reason);
    else restoreRenderer(renderer);
    return Boolean(reason);
  }

  function processLegacy(card) {
    const author = card.querySelector(".user-name, .name, .user-info .name, [class*='user-name'], [class*='username']");
    const body = card.querySelector(LEGACY_BODY);
    const text = `${textOf(author)} ${textOf(body) || textOf(card)}`.toLocaleLowerCase();
    const keywordHit = settings.keywords && terms().some(term => text.includes(term.toLocaleLowerCase()));
    const badge = card.querySelector(LEVEL_BADGES);
    const badgeText = badge
      ? `${badge.getAttribute("aria-label") || ""} ${badge.getAttribute("title") || ""} ${textOf(badge)} ${badge.getAttribute("class") || ""}`
      : "";
    const match = badgeText.match(/(?:等级|level|lv\.?)[^0-9]{0,8}(\d{1,2})/i)
      || badgeText.match(/\b(\d)\s*级\b/i)
      || badgeText.match(/(?:level|lv)[-_]?(\d)/i);
    const reason = keywordHit ? "keyword" : settings.lowLevel && match && Number(match[1]) < 3 ? "level" : "";
    card.classList.toggle("bili-clean-hidden", Boolean(settings.enabled && reason));
    if (settings.enabled && reason) card.dataset.biliCommentFilterReason = reason;
    else delete card.dataset.biliCommentFilterReason;
    return Boolean(settings.enabled && reason);
  }

  function enqueue(element) {
    if (!element) return;
    queued.add(element);
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = 0;
      const batch = queued;
      queued = new Set();
      let hidden = 0;
      for (const item of batch) {
        hidden += Number(item.matches?.(COMMENT_RENDERERS) ? processRenderer(item) : processLegacy(item));
      }
      updateStatus(batch.size, hidden);
    }, 80);
  }

  function observeRoot(root) {
    if (!root || observedRoots.has(root)) return;
    observedRoots.add(root);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  function scan(root) {
    if (!root) return;
    if (isElement(root)) {
      const renderer = findRenderer(root);
      if (renderer) enqueue(renderer);
      const legacy = findLegacyCard(root);
      if (legacy) enqueue(legacy);
      if (root.matches?.(COMMENT_RENDERERS)) enqueue(root);
      if (root.shadowRoot && root.matches?.(SHADOW_HOSTS)) {
        observeRoot(root.shadowRoot);
        scan(root.shadowRoot);
      }
    }
    root.querySelectorAll?.(LEGACY_CARDS).forEach(enqueue);
    root.querySelectorAll?.(COMMENT_RENDERERS).forEach(enqueue);
    root.querySelectorAll?.(SHADOW_HOSTS).forEach(host => {
      if (host.shadowRoot) {
        observeRoot(host.shadowRoot);
        scan(host.shadowRoot);
      }
    });
  }

  function updateStatus(checked, hidden) {
    if (!statusNode || !statusNode.isConnected) {
      statusNode = document.createElement("div");
      statusNode.id = "bili-clean-status";
      document.documentElement.appendChild(statusNode);
    }
    statusNode.hidden = !settings.enabled;
    statusNode.textContent = settings.enabled
      ? checked == null ? "B 站评论过滤已运行 · 等待评论" : `B 站评论过滤已运行 · 检查 ${checked} 条 · 隐藏 ${hidden} 条`
      : "B 站评论过滤已暂停";
  }

  observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "characterData") {
        const renderer = findRenderer(record.target);
        if (renderer) enqueue(renderer);
        const legacy = findLegacyCard(record.target);
        if (legacy) enqueue(legacy);
        continue;
      }
      for (const node of record.addedNodes) {
        const renderer = findRenderer(node);
        if (renderer) enqueue(renderer);
        const legacy = findLegacyCard(node);
        if (legacy) enqueue(legacy);
        if (isElement(node)) scan(node);
      }
    }
  });

  observeRoot(document.documentElement);
  chrome.storage.sync.get({ ...DEFAULTS, termsVersion: 0 }, stored => {
    const savedTerms = Array.isArray(stored.terms) ? stored.terms : DEFAULTS.terms;
    const needsMigration = Number(stored.termsVersion || 0) < TERMS_VERSION;
    const mergedTerms = needsMigration ? [...new Set([...DEFAULTS.terms, ...savedTerms])] : savedTerms;
    settings = { ...DEFAULTS, ...stored, terms: mergedTerms };
    if (needsMigration) chrome.storage.sync.set({ terms: mergedTerms, termsVersion: TERMS_VERSION });
    updateStatus(null, 0);
    scan(document);
    setTimeout(() => scan(document), 300);
    setTimeout(() => scan(document), 1200);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, change] of Object.entries(changes)) settings[key] = change.newValue;
    updateStatus(null, 0);
    scan(document);
  });
})();
