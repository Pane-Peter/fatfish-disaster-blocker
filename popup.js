const defaults = {
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
const termsVersion = 2;
const ids = ["enabled", "lowLevel", "keywords"];
const terms = document.getElementById("terms");
const status = document.getElementById("status");
let timer;
chrome.storage.sync.get({ ...defaults, termsVersion: 0 }, settings => {
  const savedTerms = Array.isArray(settings.terms) ? settings.terms : defaults.terms;
  if (Number(settings.termsVersion || 0) < termsVersion) {
    settings.terms = [...new Set([...defaults.terms, ...savedTerms])];
    chrome.storage.sync.set({ terms: settings.terms, termsVersion });
  }
  ids.forEach(id => document.getElementById(id).checked = settings[id]);
  terms.value = (settings.terms || defaults.terms).join("，");
});
function save() {
  const settings = Object.fromEntries(ids.map(id => [id, document.getElementById(id).checked]));
  settings.terms = terms.value.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
  chrome.storage.sync.set(settings, () => {
    status.textContent = "已保存";
    clearTimeout(timer);
    timer = setTimeout(() => status.textContent = "", 1200);
  });
}
ids.forEach(id => document.getElementById(id).addEventListener("change", save));
terms.addEventListener("input", save);
