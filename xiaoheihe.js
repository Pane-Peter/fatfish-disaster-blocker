(() => {
  "use strict";

  // Xiaoheihe-only filter. Bilibili has a separate script and level parser.
  const DEFAULTS = {
    enabled: true,
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
  const XHH_COMMENTS = ".link-comment__list .link-comment__comment-item";
  const XHH_REPLIES = ".link-comment__list .link-comment__comment-item .comment-children-item";
  const observedRoots = new WeakSet();
  let settings = { ...DEFAULTS };
  let observer;
  let queued = new Set();
  let flushTimer = 0;
  let statusNode;

  const isElement = node => node?.nodeType === Node.ELEMENT_NODE;
  const textOf = node => (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
  const terms = () => (Array.isArray(settings.terms) ? settings.terms : DEFAULTS.terms)
    .map(term => String(term).trim()).filter(Boolean);

  function findItem(node) {
    const element = isElement(node) ? node : node?.parentElement;
    if (!element) return null;
    return element.matches(XHH_REPLIES) ? element : element.closest?.(XHH_REPLIES)
      || (element.matches(XHH_COMMENTS) ? element : element.closest?.(XHH_COMMENTS)) || null;
  }

  function hasLevelBadge(usernameNode) {
    if (!usernameNode) return false;
    const scope = usernameNode.parentElement?.parentElement || usernameNode.parentElement;
    if (!scope) return false;
    const candidates = new Set([scope, ...scope.querySelectorAll(
      "[class*='level'], [class*='Level'], [class*='lv'], [class*='Lv'], [class*='等级'], [class*='author'], [class*='Author'], [class*='作者'], [class*='badge'], [class*='Badge'], [aria-label*='LV'], [title*='LV'], span, i, b, em, small, img"
    )]);
    return [...candidates].some(element => {
      const label = `${textOf(element)} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.getAttribute("alt") || ""} ${element.getAttribute("class") || ""}`;
      return /\b(?:lv\.?\s*\d+|level\s*\d+|\d+\s*级)\b/i.test(label) || /作者/.test(label);
    });
  }

  function process(item) {
    const isReply = item.matches(XHH_REPLIES);
    const usernameSelector = isReply ? ".children-item__comment-creator" : ".info-box__username";
    const bodySelector = isReply ? ".children-item__comment-content" : ".comment-item__content";
    const usernameNode = item.querySelector(usernameSelector);
    const searchable = `${textOf(usernameNode)} ${textOf(item.querySelector(bodySelector))}`.toLocaleLowerCase();
    const keywordHit = settings.keywords && terms().some(term => searchable.includes(term.toLocaleLowerCase()));
    const noLevelHit = settings.xhhNoLevel && Boolean(usernameNode) && !hasLevelBadge(usernameNode);
    const reason = settings.enabled && (keywordHit || noLevelHit)
      ? keywordHit ? "keyword" : "no-level" : "";
    item.classList.toggle("xhh-clean-hidden", Boolean(reason));
    if (reason) item.dataset.biliCommentFilterReason = reason;
    else delete item.dataset.biliCommentFilterReason;
    return Boolean(reason);
  }

  function enqueue(item) {
    if (!item) return;
    queued.add(item);
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = 0;
      const batch = queued;
      queued = new Set();
      let hidden = 0;
      for (const item of batch) hidden += Number(process(item));
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
      const item = findItem(root);
      if (item) enqueue(item);
    }
    root.querySelectorAll?.(`${XHH_COMMENTS}, ${XHH_REPLIES}`).forEach(enqueue);
  }

  function updateStatus(checked, hidden) {
    if (!statusNode || !statusNode.isConnected) {
      statusNode = document.createElement("div");
      statusNode.id = "bili-clean-status";
      document.documentElement.appendChild(statusNode);
    }
    statusNode.hidden = !settings.enabled;
    statusNode.textContent = settings.enabled
      ? checked == null ? "小黑盒评论过滤已运行 · 等待评论" : `小黑盒评论过滤已运行 · 检查 ${checked} 条 · 隐藏 ${hidden} 条`
      : "小黑盒评论过滤已暂停";
  }

  observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "characterData") {
        const item = findItem(record.target);
        if (item) enqueue(item);
        continue;
      }
      for (const node of record.addedNodes) {
        const item = findItem(node);
        if (item) enqueue(item);
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

