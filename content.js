(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    lowLevel: true,
    xhhNoLevel: true,
    keywords: true,
    terms: [
      "本鱼", "本肥鱼", "肥鱼", "大肥鱼", "小肥鱼", "肥肥鱼",
      "鱼鱼", "鱼鱼我呀", "鱼宝", "鱼宝贝", "小鱼", "小鲸鱼", "鲸鱼", "本鲸",
      "鱼主人", "鲸鱼主人", "主人", "主人大人", "我的主人",
      "本鱼觉得", "本鱼认为", "本鱼表示", "本鱼来啦", "鱼鱼来啦",
      "DeepSeek", "Deep Seek", "深度求索", "DeepSeek-R1", "DeepSeek-V3",
    ],
  };
  const TERMS_VERSION = 2;

  // New video comment UI: bili-comments -> shadow DOM -> thread/reply renderers.
  const SHADOW_HOSTS = "bili-comments, bili-comment-thread-renderer, bili-comment-renderer, bili-comment-reply-renderer";
  const COMMENT_RENDERERS = "bili-comment-thread-renderer, bili-comment-reply-renderer";
  // Legacy comments are still used on some Bilibili pages.
  const LEGACY_CARDS = ".reply-item, .root-reply-container, .sub-reply-item, .reply-item-wrap, .root-reply, .sub-reply";
  const LEGACY_BODY = ".reply-content, .reply-content-container, .content-wrp, .text-con, .reply-con";
  const LEVEL_BADGES = "[class*='level'], [class*='等级'], [aria-label*='LV'], [title*='LV']";
  // Xiaoheihe link-page comment cards (top-level comments and their replies).
  const XHH_COMMENTS = ".link-comment__list .link-comment__comment-item";
  const XHH_REPLIES = ".link-comment__list .link-comment__comment-item .comment-children-item";

  const observedRoots = new WeakSet();
  const originalDisplays = new WeakMap();
  const xhhOriginalDisplays = new WeakMap();
  let settings = { ...DEFAULTS };
  let observer;
  let queued = new Map();
  let flushTimer = 0;
  let statusNode;

  const isElement = node => node?.nodeType === Node.ELEMENT_NODE;
  const textOf = node => (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
  function renderedText(root) {
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
  const terms = () => (Array.isArray(settings.terms) ? settings.terms : DEFAULTS.terms)
    .map(term => String(term).trim()).filter(Boolean);

  function findLegacyCard(node) {
    const element = isElement(node) ? node : node?.parentElement;
    return element?.matches(LEGACY_CARDS) ? element : element?.closest?.(LEGACY_CARDS) || null;
  }

  // Return the nearest actual comment item, crossing shadow boundaries as needed.
  function findCommentRenderer(node) {
    let element = isElement(node) ? node : node?.parentElement;
    while (element) {
      if (element.matches?.(COMMENT_RENDERERS)) return element;
      if (element.parentElement) {
        element = element.parentElement;
      } else {
        const root = element.getRootNode?.();
        element = root?.host || null;
      }
    }
    return null;
  }

  function readPayload(renderer) {
    // Bilibili's Lit comment renderers expose member/content/level in __data.
    // In isolated worlds this expando can be unavailable, so rendered DOM is the fallback.
    const data = renderer.__data;
    return {
      username: typeof data?.member?.uname === "string" ? data.member.uname.trim() : "",
      message: typeof data?.content?.message === "string" ? data.content.message.trim() : "",
      level: Number.isInteger(data?.member?.level_info?.current_level)
        ? data.member.level_info.current_level : null,
    };
  }

  function rendererBody(renderer) {
    const ownShadow = renderer.shadowRoot;
    const body = ownShadow?.querySelector("#body");
    if (body) return body;
    // Root thread renderers wrap their visual comment in bili-comment-renderer.
    return ownShadow?.querySelector("bili-comment-renderer")?.shadowRoot?.querySelector("#body") || renderer;
  }

  function rendererLevel(renderer, body) {
    const candidates = [];
    const scopes = [body];
    const seen = new Set();
    const visitRenderer = host => {
      if (!host || seen.has(host)) return;
      seen.add(host);
      candidates.push(host);
      if (!host.shadowRoot) return;
      scopes.push(host.shadowRoot);
      host.shadowRoot.querySelectorAll?.("bili-comment-thread-renderer, bili-comment-renderer, bili-comment-reply-renderer, bili-comment-user-info")
        .forEach(visitRenderer);
    };
    visitRenderer(renderer);

    let payloadLevel = null;
    for (const candidate of candidates) {
      const data = candidate.__data;
      const possibleLevels = [
        data?.member?.level_info?.current_level,
        data?.member?.levelInfo?.currentLevel,
        data?.member?.current_level,
        data?.member?.level,
      ];
      for (const value of possibleLevels) {
        const parsed = typeof value === "number" || /^\d+$/.test(String(value ?? "").trim())
          ? Number(value) : NaN;
        if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) {
          payloadLevel = parsed;
          break;
        }
      }
      if (payloadLevel !== null) break;
    }
    if (payloadLevel !== null && payloadLevel >= 0 && payloadLevel <= 6) return payloadLevel;

    // Search only the comment's open shadow roots, including nested user-info components.
    for (const scope of scopes) {
      for (const badge of scope.querySelectorAll?.(`${LEVEL_BADGES}, #user-level`) || []) {
        const className = typeof badge.className === "string" ? badge.className : "";
        const raw = `${badge.getAttribute("aria-label") || ""} ${badge.getAttribute("title") || ""} ${textOf(badge)} ${className}`;
        const match = raw.match(/(?:等级|level|lv\.?)[^0-9]{0,8}(\d{1,2})/i)
          || raw.match(/\b(\d)\s*级\b/i)
          || raw.match(/(?:level|lv)[-_]?(\d)/i);
        if (match && Number(match[1]) <= 6) return Number(match[1]);
      }
    }
    return null;
  }

  function rendererMatches(renderer) {
    const payload = readPayload(renderer);
    // Walk only this comment's #body and any nested open roots (rich text/user info).
    const bodyText = renderedText(rendererBody(renderer));
    const searchable = `${payload.username} ${payload.message} ${bodyText}`.toLocaleLowerCase();
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
    const body = rendererBody(renderer);
    let reason = "";
    if (settings.enabled && settings.keywords && rendererMatches(renderer)) reason = "keyword";
    if (!reason && settings.enabled && settings.lowLevel) {
      const level = rendererLevel(renderer, body);
      if (level !== null && level < 3) reason = "level";
    }
    if (reason) applyRenderer(renderer, reason);
    else restoreRenderer(renderer);
    return Boolean(reason);
  }

  function legacyMatches(card) {
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
    const lowLevelHit = settings.lowLevel && match && Number(match[1]) < 3;
    return keywordHit ? "keyword" : lowLevelHit ? "level" : "";
  }

  function processLegacy(card) {
    const reason = settings.enabled ? legacyMatches(card) : "";
    card.classList.toggle("bili-clean-hidden", Boolean(reason));
    if (reason) card.dataset.biliCommentFilterReason = reason;
    else delete card.dataset.biliCommentFilterReason;
    return Boolean(reason);
  }

  function findXhhItem(node) {
    const element = isElement(node) ? node : node?.parentElement;
    if (!element) return null;
    return element.matches(XHH_REPLIES) ? element : element.closest?.(XHH_REPLIES)
      || (element.matches(XHH_COMMENTS) ? element : element.closest?.(XHH_COMMENTS)) || null;
  }

  function processXhh(item) {
    const isReply = item.matches(XHH_REPLIES);
    const usernameSelector = isReply ? ".children-item__comment-creator" : ".info-box__username";
    const bodySelector = isReply ? ".children-item__comment-content" : ".comment-item__content";
    const usernameNode = item.querySelector(usernameSelector);
    const username = textOf(usernameNode);
    const body = textOf(item.querySelector(bodySelector));
    const searchable = `${username} ${body}`.toLocaleLowerCase();
    const keywordHit = settings.keywords && terms().some(term => searchable.includes(term.toLocaleLowerCase()));
    const levelScopes = [usernameNode?.parentElement, usernameNode?.parentElement?.parentElement].filter(Boolean);
    const levelElements = new Set();
    for (const scope of levelScopes) {
      scope.querySelectorAll?.("[class*='level'], [class*='Level'], [class*='lv'], [class*='Lv'], [class*='等级'], [class*='author'], [class*='Author'], [class*='作者'], [class*='badge'], [class*='Badge'], [aria-label*='LV'], [title*='LV'], span, i, b, em, small, img")
        .forEach(element => levelElements.add(element));
    }
    const hasLevelBadge = [...levelElements].some(element => {
      const label = `${textOf(element)} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.getAttribute("alt") || ""} ${element.getAttribute("class") || ""}`;
      return /\b(?:lv\.?\s*\d+|level\s*\d+|\d+\s*级)\b/i.test(label) || /作者/.test(label);
    });
    const noLevelHit = settings.xhhNoLevel && Boolean(usernameNode) && !hasLevelBadge;
    const reason = settings.enabled && (keywordHit || noLevelHit)
      ? keywordHit ? "keyword" : "no-level" : "";

    if (!xhhOriginalDisplays.has(item)) {
      xhhOriginalDisplays.set(item, {
        value: item.style.getPropertyValue("display"),
        priority: item.style.getPropertyPriority("display"),
      });
    }
    item.classList.toggle("xhh-clean-hidden", Boolean(reason));
    if (reason) item.dataset.biliCommentFilterReason = reason;
    else delete item.dataset.biliCommentFilterReason;
    if (!reason) {
      const original = xhhOriginalDisplays.get(item);
      if (original.value) item.style.setProperty("display", original.value, original.priority);
      else item.style.removeProperty("display");
    }
    return Boolean(reason);
  }

  function updateStatus(checked, hidden) {
    if (!statusNode || !statusNode.isConnected) {
      statusNode = document.createElement("div");
      statusNode.id = "bili-clean-status";
      document.documentElement.appendChild(statusNode);
    }
    statusNode.hidden = !settings.enabled;
    statusNode.textContent = settings.enabled
      ? checked == null ? "评论过滤已运行 · 等待评论" : `评论过滤已运行 · 检查 ${checked} 条 · 隐藏 ${hidden} 条`
      : "评论过滤已暂停";
  }

  function enqueue(element, type) {
    if (!element) return;
    queued.set(element, type);
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = 0;
      const batch = queued;
      queued = new Map();
      let hidden = 0;
      for (const [item, kind] of batch) {
        hidden += Number(kind === "renderer" ? processRenderer(item)
          : kind === "legacy" ? processLegacy(item) : processXhh(item));
      }
      updateStatus(batch.size, hidden);
    }, 80);
  }

  function observeRoot(root) {
    if (!root || observedRoots.has(root)) return;
    observedRoots.add(root);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  // Only inspect comment components and their own shadow roots; never walk the video/player DOM.
  function scan(root) {
    if (!root) return;
    if (isElement(root)) {
      const renderer = findCommentRenderer(root);
      if (renderer) enqueue(renderer, "renderer");
      const legacy = findLegacyCard(root);
      if (legacy) enqueue(legacy, "legacy");
      const xhhItem = findXhhItem(root);
      if (xhhItem) enqueue(xhhItem, "xhh");
      if (root.matches?.(COMMENT_RENDERERS)) enqueue(root, "renderer");
      if (root.shadowRoot && root.matches?.(SHADOW_HOSTS)) {
        observeRoot(root.shadowRoot);
        scan(root.shadowRoot);
      }
    }

    root.querySelectorAll?.(LEGACY_CARDS).forEach(card => enqueue(card, "legacy"));
    root.querySelectorAll?.(`${XHH_COMMENTS}, ${XHH_REPLIES}`).forEach(item => enqueue(item, "xhh"));
    root.querySelectorAll?.(SHADOW_HOSTS).forEach(host => {
      if (host.matches(COMMENT_RENDERERS)) enqueue(host, "renderer");
      if (host.shadowRoot) {
        observeRoot(host.shadowRoot);
        scan(host.shadowRoot);
      }
    });
  }

  observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "characterData") {
        const renderer = findCommentRenderer(record.target);
        if (renderer) enqueue(renderer, "renderer");
        const legacy = findLegacyCard(record.target);
        if (legacy) enqueue(legacy, "legacy");
        const xhhItem = findXhhItem(record.target);
        if (xhhItem) enqueue(xhhItem, "xhh");
        continue;
      }
      for (const node of record.addedNodes) {
        const renderer = findCommentRenderer(node);
        if (renderer) enqueue(renderer, "renderer");
        const legacy = findLegacyCard(node);
        if (legacy) enqueue(legacy, "legacy");
        const xhhItem = findXhhItem(node);
        if (xhhItem) enqueue(xhhItem, "xhh");
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
    // Bounded retries catch custom elements whose shadow roots attach just after insertion.
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
